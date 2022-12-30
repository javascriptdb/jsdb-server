import express from 'express';
import passport from 'passport';
import { Strategy as CustomStrategy } from 'passport-custom';
import {Strategy as LocalStrategy} from 'passport-local';
import bcrypt from "bcryptjs";
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import {Strategy as GithubStrategy} from 'passport-github2';
import {createAccessToken, validateAccessToken} from './authUtils.js'

import {DatabaseArray} from '@jsdb/sdk';
const users = new DatabaseArray('users')
const accessTokens = new DatabaseArray('accessTokens')
const app = express();

passport.use('token-custom', new CustomStrategy(
  async function(req, done) {
    try {
      const token = req.get('Authorization').split('Bearer ')[1]
      const accessToken = await validateAccessToken(token);
      const user = await users[accessToken.userId];
      done(null, user);
    } catch (e) {
      return req.res.status(401).send(e);
      // not sure if `done(e)` is required
    }
  }
));

passport.use(
  'signup',
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    async (email, password, done) => {
      try {
        const existingUser = await users.find(user => user.auth?.providers?.JsDb?.credentials?.email === ctx.email, {ctx: {email}});
        if(existingUser) throw 'This email is already used, login or claim email'
        const credentials = {
          email,
          password: bcrypt.hashSync(password, 8)
        }
        let user = {
          auth:{
            providers: {
              'JsDb': {
                credentials,
                verified: false
              }
            }
          }
        }
        const userId = await users.push(user)
        user = await users[userId];
        return done(null, user);
      } catch (error) {
        done(error);
      }
    }
  )
);

passport.use(
  'login',
  new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    async (email, password, done) => {
      try {
        const user = users.find((user) => user.auth?.providers?.JsDb?.credentials?.email === ctx.email, {ctx: email})

        if(!bcrypt.compareSync(password, user.auth.providers.JsDb.credentials.password)){
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
      const token = await createAccessToken(req.user.id);
      res.send({ token });
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
              const token = await createAccessToken(user.id)
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

async function getUserWithEmails(emails) {
  return users.find((user) => {
    let match = false;
    for(const [providerName, provider] of  Object.entries(user.auth?.providers || {})) {
      let providerMatched;
      if (providerName === 'JsDb') {
        if (!provider?.verified) {
          continue;
        }
        providerMatched = ctx.emails.includes(provider.credentials.email);
      } else { // Oauth2
        providerMatched = provider?.emails?.find(email => ctx.emails.includes(email.value));
      }
      if(providerMatched) {
        match = true;
        break
      }
    }
    return match;
  }, {ctx: {emails}})
}

async function oAuth2LoginHandler(accessToken, refreshToken, profile, cb) {
  const emails = profile.emails?.map(email => email.value) || [];
  let user;
  if(emails.length > 0) {
    user = await getUserWithEmails(emails);
  }
  let id;
  if (!user) {
    id = await users.push({
      auth: {
        providers: {
          [profile.provider]: profile
        }
      }
    })
  } else {
    await (users[user.id].auth.providers[profile.provider] = profile);
    id = user.id;
  }
  user = await users[id]
  return cb(null, user)
}
async function oAuth2CallbackHandler(req, res) {
  const user = req.user;
  const state = JSON.parse(req.query.state);
  const token = await createAccessToken(user.id)
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
    const users = new DatabaseArray('users');
    if (!req.body.oldToken) throw 'oldToken is required';
    if (!req.body.newToken) throw 'newToken is required';
    const verifiedOldToken = await validateAccessToken(req.body.oldToken);
    const verifiedNewToken = await validateAccessToken(req.body.newToken);
    if (verifiedOldToken.userId === verifiedNewToken.userId) return;
    const oldUser = await users[verifiedOldToken.userId];
    const newUser = await users[verifiedNewToken.userId];
    oldUser.auth = {
      ...oldUser.auth,
      providers: {
        ...(oldUser.auth?.providers || {}),
        ...(newUser.auth?.providers || {})
      }
    }
    await (users[oldUser.id].auth = oldUser.auth)
    await (delete users[newUser.id])
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
app.post(
  '/revoke-tokens',
  async (req, res) => {
    const userId = req.body.userId;
    if(!userId) throw 'userId is required';
    const tokens  = await accessTokens.filter(accessToken => accessToken.userId === ctx.userId, {ctx:{userId}});
    await Promise.all(
      tokens.map(token => (delete accessTokens[token.id]))
    );
    return tokens.length
  }
);
app.post(
  '/verify-email',
  async (req, res) => {
    const userId = req.body.userId;
    if(!userId) throw 'userId is required';
    await (users[userId].auth.providers.JsDb.verified = true);
    return true
  }
);
export default app;

