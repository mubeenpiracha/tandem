export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  timezone: string;
  googleConnected: boolean;
  slackConnected: boolean;
}

export interface AuthTokens {
  accessToken: string;
}

export interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface GoogleAuthBody {
  id_token: string;
}

export interface RefreshBody {
  // Body is empty — refresh token comes from httpOnly cookie
}

export interface VerifyEmailBody {
  token: string;
}

export interface ResendVerificationBody {
  // No body needed — user is identified via JWT
}

export interface ForgotPasswordBody {
  email: string;
}

export interface ResetPasswordBody {
  token: string;
  password: string;
}
