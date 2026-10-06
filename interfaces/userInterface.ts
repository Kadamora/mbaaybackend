export interface user {
  name: string;
  email: string;
  isBlocked?: string;
  password: string | null;
  refreshToken?: string;
  phoneNumber: string | null;
  country: string | null;
  verificationCode: string | null;
  isverified: boolean;
  notifications: {}[];
  orders: {}[];
  otpCode: string | null;
  otpExpires: Date | null;
}
