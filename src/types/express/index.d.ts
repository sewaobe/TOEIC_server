import { JwtUserPayload } from "../../middlewares/verifyAccessToken.middleware"

declare global {
    namespace Express {
        interface Request {
            user?: JwtUserPayload
        }
    }
}