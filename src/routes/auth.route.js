import { Router } from 'express';
import  loginController  from '../controllers/login.controller.js';

const router = Router();

router.get('/login',loginController);

export default router;



