declare module 'otplib' {
  export const authenticator: {
    generateSecret: (options?: any) => string;
    keyuri: (user: string, service: string, secret: string) => string;
    check: (token: string, secret: string) => boolean;
    verify: (options: { token: string; secret: string }) => boolean;
    checkDelta: (token: string, secret: string) => number | null;
    [key: string]: any;
  };
  export const generateSecret: (options?: any) => string;
  export const generateURI: (options: any) => string;
  export const verifySync: (options: any) => any;
  export const TOTP: any;
  export const HOTP: any;
  export const OTP: any;
}
