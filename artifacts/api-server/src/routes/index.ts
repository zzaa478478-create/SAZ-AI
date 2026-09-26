import { Router, type IRouter } from "express";
import assistantRouter from "./assistant";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assistantRouter);

export default router;
