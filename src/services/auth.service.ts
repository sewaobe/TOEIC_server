import { User, IUser } from '../models/user.model';
import { comparePassword, hashPassword } from '../utils/hash';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { Role } from '../models/role.model';
import admin from '../utils/firebase';

interface LoginRequest {
  username: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  fullname: string;
  username: string;
}

export const loginService = async ({
  username,
  password,
}: LoginRequest): Promise<{
  accessToken: string;
  refreshToken: string;
  role_name: string;
  user_id: string;
}> => {
  const user: IUser | null = await User
    .findOne({ username })
    .populate("role_id", "name")
    .lean();
  if (!user) throw new Error('Username does not exist');

  const match = await comparePassword(password, user.passwordHash);
  if (!match) throw new Error('Password is not correct');

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    accessToken,
    refreshToken,
    role_name: (user.role_id as any)?.name || null,
    user_id: user._id.toString()
  };
};

export const registerService = async ({
  email,
  password,
  fullname,
  username,
}: RegisterRequest): Promise<{ message: string }> => {
  const isEmailExist = await User.findOne({ email });
  if (isEmailExist) throw new Error('Email already exists');

  const isUsernameExist = await User.findOne({ username });
  if (isUsernameExist) throw new Error('Username already exists');

  const studentRole = await Role.findOne({ name: 'student' });
  if (!studentRole)
    throw new Error('Default role "student" not found. Please seed it in DB.');

  const hashedPassword = await hashPassword(password);
  const user = new User({
    email,
    passwordHash: hashedPassword,
    profile: {
      fullname: fullname,
      avatar: '',
    },
    username,
    role_id: studentRole._id,
  });
  await user.save();

  return {
    message: 'Register Successfully',
  };
};

export const loginWithGoogleService = async (
  idToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  role_name: string;
  user_id: string;
}> => {
  // 1. Verify token from Firebase
  const decoded = await admin.auth().verifyIdToken(idToken);
  const { uid, email, name, picture } = decoded;

  if (!email) {
    throw new Error('Google account does not provide email');
  }

  // 2. Tìm user trong DB
  let user: IUser | null = await User.findOne({ firebaseUid: uid }).populate(
    'role_id',
    'name'
  );

  // Nếu chưa có thì tìm theo email (phòng trường hợp trước đó user đăng ký bằng email/password)
  if (!user) {
    user = await User.findOne({ email }).populate('role_id', 'name');
  }

  // Nếu vẫn chưa có thì tạo mới
  if (!user) {
    const defaultRole = await Role.findOne({ name: 'student' });
    if (!defaultRole) {
      throw new Error(
        'Default role "student" not found. Please seed it in DB.'
      );
    }

    user = await User.create({
      firebaseUid: uid,
      email,
      profile: {
        fullname: name || 'No name',
        avatar: picture || '',
      },
      username: email.split('@')[0], // auto tạo username từ email
      role_id: defaultRole._id,
    });
  } else if (!user.firebaseUid) {
    // Nếu user đã tồn tại bằng email nhưng chưa có firebaseUid thì cập nhật
    user.firebaseUid = uid;
    await user.save();
  }

  // 3. Tạo JWT
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  return {
    accessToken,
    refreshToken,
    role_name: (user.role_id as any)?.name || null,
    user_id: user._id.toString()
  };
};