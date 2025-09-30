import { NextFunction, Request, Response } from 'express';
export const demo = async(req: Request, res:Response, next: NextFunction) => {
    try {
        res.status(200).json("Hello test");
    }
    catch(err) {
        next(err)
    }
}