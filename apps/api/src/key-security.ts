import {createHash} from 'node:crypto';

export const keyHash=(value:string)=>createHash('sha256').update(value).digest('hex');
