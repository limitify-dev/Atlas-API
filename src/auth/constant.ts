export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'longest_secret_key',
  accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY
    ? parseInt(process.env.JWT_ACCESS_EXPIRY)
    : 900, // 15 minutes in seconds
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY
    ? parseInt(process.env.JWT_REFRESH_EXPIRY)
    : 604800, // 7 days in seconds
};
