import { Inject } from '@nestjs/common';
import { ENV } from './config.module.js';

export const InjectEnv = () => Inject(ENV);
