import { JWTPayload } from "../middleware/auth";

export const parseUserBearerToken = async (
   jwtInstance: any,
   bearerToken: string | undefined
): Promise<JWTPayload | null> => {

   if (!bearerToken) {
      console.error("Token tidak ditemukan");
      return null;
   }

   const payload = await jwtInstance.verify(bearerToken);

   if (!payload) {
      console.error("Token tidak valid atau expired");
      return null;
   }

   return payload as JWTPayload;
};