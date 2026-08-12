if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Refusing to start with a hardcoded default secret — ' +
      'set JWT_SECRET in the environment (see .env.example).',
  );
}

export const jwtConstants = {
  secret: process.env.JWT_SECRET,
  accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY
    ? parseInt(process.env.JWT_ACCESS_EXPIRY)
    : 900, // 15 minutes in seconds
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY
    ? parseInt(process.env.JWT_REFRESH_EXPIRY)
    : 604800, // 7 days in seconds
};
