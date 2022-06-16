import express from 'express';
import jwt from "jsonwebtoken";
import JwtStrategy from "passport-jwt";
import passport from "passport";
import {Strategy as localStrategy} from 'passport-local';
import bcrypt from "bcryptjs";
import {opHandlers} from "./opHandlersSqlite.js";

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
        const result = await opHandlers.set({collection:'users', value: user})
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
        const user = await opHandlers.find({collection: 'users',callbackFn,thisArg:{email}})

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