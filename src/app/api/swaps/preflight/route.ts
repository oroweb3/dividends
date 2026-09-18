import { handlePreview } from '@/lib/swaps/handler';
export const runtime='nodejs';
export async function POST(request:Request){return handlePreview(request,true);}
