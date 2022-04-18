import express from 'express';
import db from './db.js';
import jwt from "jsonwebtoken";
import JwtStrategy from "passport-jwt";
import passport from "passport";
import {Strategy as localStrategy} from 'passport-local';

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
        const user = {credentials: {email, password}};
        const result = await db.collection('users').insertOne(user);
        return done(null, {email, _id: result.insertedId});
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
        const user = await db.collection('users').findOne({credentials: {email, password}});

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
      const token = jwt.sign({ user: { _id: req.user._id, email: req.user.email } }, process.env.JWT_SECRET);
      res.send({ token, userId: req.user._id });
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
            const error = new Error('An error occurred.');
            return next(error);
          }

          req.login(
            user,
            { session: false },
            async (error) => {
              if (error) return next(error);

              const body = { _id: user._id, email: user.email };
              const token = jwt.sign({ user: body }, process.env.JWT_SECRET);

              return res.json({ token, userId: user._id });
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