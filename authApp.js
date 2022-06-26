import express from 'express';
import jwt from 'jsonwebtoken';
import JwtStrategy from 'passport-jwt';
import passport from 'passport';
import {Strategy as localStrategy} from 'passport-local';
import bcrypt from "bcryptjs";
import {opHandlers} from "./opHandlersBetterSqlite.js";
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import {Strategy as GithubStrategy} from 'passport-github2';

import {DatabaseArray} from '@jsdb/sdk';

const app = express();

passport.use(
  new JwtStrategy.Strategy(
    {
      secretOrKey: process.env.JWT_SECRET,
      jwtFromRequest: JwtStrategy.ExtractJwt.fromAuthHeaderAsBearerToken()
    },
    async (token, done) => {
      try {
        return done(null, token.user);
      } catch (error) {
        done(error);
      }
    }
  )
);
async function oAuth2LoginHandler(accessToken, refreshToken, profile, cb) {
  const auths = new DatabaseArray('auth')
  const emails = profile.emails.map(email => email.value);
  const authUser = await auths.find((auth) => {
    let match = false;
    for(const provider of  Object.values(auth?.providers || {})) {
      const providerMatched = provider?.emails?.find(email => emails.includes(email.value));
      if(providerMatched) {
        match = true;
        break
      }
    }
    return match;
  }, {profile, emails})
  if (!authUser) {
    await auths.push({
      providers: {
        [profile.provider]: profile
      }
    })
  } else {
    await (auths[authUser.id].providers[profile.provider] = profile)
  }
  return cb(null, profile)
}
function oAuth2CallbackHandler(req, res) {
  const user = req.user;
  const state = JSON.parse(req.query.state);
  const token = jwt.sign({ user }, process.env.JWT_SECRET);
  res.send(`
        <script>
           window.opener.postMessage("${token}", "${state.url}");
        </script>
      `)
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: (new URL('/auth/oauth2/google/callback', process.env.SERVER_URL)).toString(),
    },
    async function (accessToken, refreshToken, profile, cb) {
       return oAuth2LoginHandler(accessToken, refreshToken, profile, cb)
    }
  ));

  app.get(
    '/oauth2/signin-with-google',
    (req, res, next) => {
       passport.authenticate(
        'google',
        {
          scope:[ 'email', 'profile', 'openid'],
          state: JSON.stringify({url: req.query.url})
         }
        )
       (req,res,next)
    }
  );
  app.get('/oauth2/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/error',
        session: false
      }
    ),
    function (req, res) {
      oAuth2CallbackHandler(req, res)
    });
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GithubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: (new URL('/auth/oauth2/github/callback', process.env.SERVER_URL)).toString(),
      scope: ['user:email']
    },
    async function (accessToken, refreshToken, profile, cb) {
      await oAuth2LoginHandler(accessToken, refreshToken, profile, cb)
    }
  ));

  app.get(
    '/oauth2/signin-with-github',
    (req, res, next) => {
      passport.authenticate(
        'github',
        {
          scope: [ 'user:email', 'read:user' ],
          state: JSON.stringify({url: req.query.url})
        }
      )
      (req,res,next)
    }
  );
  app.get('/oauth2/github/callback',
    passport.authenticate('github', {
        failureRedirect: '/error',
        session: false
      }
    ),
    function (req, res) {
       oAuth2CallbackHandler(req, res)
    });
}

passport.use(
  'signup',
  new localStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    async (email, password, done) => {
      try {
        password = bcrypt.hashSync(password, 8);
        const user = {credentials: {email, password}};
        const result = opHandlers.set({collection:'users', value: user})
        return done(null, {email, id: result.insertedId});
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.use(
  'login',
  new localStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    async (email, password, done) => {
      try {
        const callbackFn = ((user) => user.credentials.email === email).toString()
        const user = opHandlers.find({collection: 'users',callbackFn,thisArg:{email}})

        if(!bcrypt.compareSync(password, user.credentials.password)){
          return done(null, false, {message: 'Invalid password'})
        }

        if (!user) {
          return done(null, false, {message: 'User not found'});
        }

        return done(null, user, {message: 'Logged in Successfully'});
      } catch (error) {
        return done(error);
      }
    }
  )
);

app.post(
  '/signup',
  passport.authenticate('signup', {session: false}),
  async (req, res) => {
    try {
      const token = jwt.sign({ user: { id: req.user.id, email: req.user.email } }, process.env.JWT_SECRET);
      res.send({ token, userId: req.user.id });
    } catch (e) {
      console.error(e);
      res.status(500).send(e);
    }
  }
);

app.post(
  '/signin',
  async (req, res, next) => {
    passport.authenticate(
      'login',
      async (err, user, info) => {
        try {
          if (err || !user) {
              console.error(err)
            const error = new Error('An error occurred.');
            return next(error);
          }

          req.login(
            user,
            { session: false },
            async (error) => {
              if (error) return next(error);

              const token = jwt.sign({ user: { id: user.id, email: user.email } }, process.env.JWT_SECRET);

              return res.json({ token, userId: user.id });
            }
          );
        } catch (error) {
          return next(error);
        }
      }
    )(req, res, next);
  }
);

export default app;
