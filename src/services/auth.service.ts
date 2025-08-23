import { User, IUser } from '../models/user.model';
import { comparePassword, hashPassword } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  username: string;
}

export const loginService = async ({
  email,
  password,
}: LoginRequest): Promise<{ accessToken: string; refreshToken: string }> => {
  const user: IUser | null = await User.findOne({ email });
  if (!user) throw new Error('Email does not exist');

  const match = await comparePassword(password, user.passwordHash);
  if (!match) throw new Error('Password is not correct');

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    accessToken,
    refreshToken,
  };
};

export const registerService = async ({
  email,
  password,
  fullName,
  username,
}: RegisterRequest): Promise<{ message: string }> => {
  const isEmailExist = await User.findOne({ email });
  if (isEmailExist) throw new Error('Email already exists');

  const isUsernameExist = await User.findOne({ username });
  if (isUsernameExist) throw new Error('Username already exists');

  const hashedPassword = await hashPassword(password);
  const user = new User({
    email,
    passwordHash: hashedPassword,
    fullName,
    username,
  });
  await user.save();

  return {
    message: 'Register Successfully',
  };
};
