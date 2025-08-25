import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { Document } from 'mongoose';
import { IUser } from '../models/user.model';
import { Types } from 'mongoose';

export interface UserPayload {
  _id: string;
  email: string;
  username: string;
  fullname: string;
}

type MaybeMongooseDoc<T> = T &
  Partial<Document> & {
    toObject?: () => T;
  };

const buildSafePayload = (payload: MaybeMongooseDoc<IUser>): UserPayload => {
  if (typeof payload.toObject === 'function') {
    payload = payload.toObject() as IUser;
  }

  return {
    _id: (payload._id as Types.ObjectId).toString(), // <-- cast here
    email: payload.email,
    username: payload.username,
    fullname: payload.profile.fullname,
  };
};

export const generateAccessToken = (
  payload: MaybeMongooseDoc<IUser>,
): string => {
  const safePayload = buildSafePayload(payload);

  return jwt.sign(
    safePayload,
    process.env.JWT_ACCESS_SECRET as Secret,
    { expiresIn: '15m' } as SignOptions,
  );
};

export const generateRefreshToken = (
  payload: MaybeMongooseDoc<IUser>,
): string => {
  const safePayload = buildSafePayload(payload);

  return jwt.sign(
    safePayload,
    process.env.JWT_REFRESH_SECRET as Secret,
    { expiresIn: '7d' } as SignOptions,
  );
};

export const generateAccessTokenFromPayload = (
  payload: UserPayload,
): string => {
  return jwt.sign(
    payload,
    process.env.JWT_ACCESS_SECRET as Secret,
    { expiresIn: '15m' } as SignOptions,
  );
};
