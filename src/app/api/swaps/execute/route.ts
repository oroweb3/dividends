import {handleConversion} from '@/lib/swaps/conversion-handler';
export const POST=(request:Request)=>handleConversion(request);
