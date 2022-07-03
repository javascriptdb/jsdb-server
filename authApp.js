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

              const token = jwt.sign(getTokenPayload(user, 'email'), process.env.JWT_SECRET);

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

function getTokenPayload(user, provider) {
  // TODO: for now we support email, but if we are going to support emails on tokens, this will need to be updated accross all old tokens when a new email y added?
  if(provider === 'google') {
    return { user: { id: user.id, email: user.providers[provider]._json.email } }
  } else if(provider === 'github') {
    let email = user.providers[provider]._json.email;
    // // for now, we just save the email the user used to login, in github case, this can be null if the user does not put on the public profile its email, but we can grab it from emails property, but we will need a way to decided which email is the correct one
    // if(!email) {
    //   if (providers[provider].emails.length === 1) {
    //     email = providers[provider].emails[0]
    //   } else if (providers[provider].emails.length > 1) {
    //     //decide how we will choose the correct one
    //   }
    // }
    return { user: { id: user.id, email } }
  } else if (provider === 'email') {
    return { user: { id: user.id, email: user.email} }
  }
}
async function oAuth2LoginHandler(accessToken, refreshToken, profile, cb) {
  const auths = new DatabaseArray('auths')
  const emails = profile.emails.map(email => email.value);
  let authUser = await auths.find((auth) => {
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
  let id;
  if (!authUser) {
    id = await auths.push({
      providers: {
        [profile.provider]: profile
      }
    })
  } else {
    await (auths[authUser.id].providers[profile.provider] = profile);
    id = authUser.id;
  }
  authUser = await auths[id]
  return cb(null, authUser)
}
function oAuth2CallbackHandler(req, res, provider) {
  const user = req.user;
  const state = JSON.parse(req.query.state);
  const token = jwt.sign(getTokenPayload(user, provider), process.env.JWT_SECRET);
  const message = JSON.stringify({token, user});
  res.send(`
        <script>
           window.opener.postMessage(${message}, "${state.url}");
        </script>
      `)
}
async function linkWithProvider(req, res){
  try {
    // TODO put this in TX
    const auths = new DatabaseArray('auths');
    if(!req.body.oldToken) throw 'oldToken is required';
    if(!req.body.newToken) throw 'newToken is required';
    const verifiedOldToken = jwt.verify(req.body.oldToken, process.env.JWT_SECRET);
    const verifiedNewToken = jwt.verify(req.body.newToken, process.env.JWT_SECRET);
    if(verifiedOldToken.user.id === verifiedNewToken.user.id) return;
    const oldUser = await auths[verifiedOldToken.user.id];
    const newUser = await auths[verifiedNewToken.user.id];
    oldUser.providers = {...oldUser.providers, ...newUser.providers}
    await (auths[oldUser.id].providers = oldUser.providers)
    await (delete auths[newUser.id])
  } catch (e) {
    res.status(500).send(e);
  }
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: (new URL('/auth/oauth2/google/callback', process.env.SERVER_URL)).toString(),
    },
    async (accessToken, refreshToken, profile, cb) => oAuth2LoginHandler(accessToken, refreshToken, profile, cb)
  ));

  app.get(
    '/oauth2/signin-with-google',
    (req, res, next) => {
       passport.authenticate(
        'google',
        {
          scope:[ 'email', 'profile', 'openid'],
          state: JSON.stringify({url: req.query.url}),
          prompt: 'select_account'
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
    async (req, res) => oAuth2CallbackHandler(req, res, 'google')
  );
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GithubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: (new URL('/auth/oauth2/github/callback', process.env.SERVER_URL)).toString(),
      scope: ['user:email']
    },
    async (accessToken, refreshToken, profile, cb) => oAuth2LoginHandler(accessToken, refreshToken, profile, cb)
  ));

  app.get(
    '/oauth2/signin-with-github',
    (req, res, next) => {
      passport.authenticate(
        'github',
        {
          scope: [ 'user:email', 'read:user' ],
          state: JSON.stringify({url: req.query.url}),
          prompt: 'select_account'
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
    async (req, res) =>  oAuth2CallbackHandler(req, res, 'github')
  );
}
app.post(
  '/link-providers',
  async (req, res) => linkWithProvider(req , res)
);
export default app;
