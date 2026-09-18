import {jobAuthorized} from '@/lib/jobs/control';
import {runScheduledTracking} from '@/lib/jobs/scheduled';
export const runtime='nodejs';
export const maxDuration=300;
import {z} from 'zod';
import {runConversionPage} from '@/lib/swaps/job';
export async function POST(request:Request){
 if(!jobAuthorized(request.headers.get('authorization'),process.env.DIVIDEND_JOB_SECRET))return Response.json({error:'Unauthorized'},{status:401});
 try{
  const body=z.object({cursor:z.string().uuid().optional()}).strict().safeParse(await request.json());
  if(!body.success)return Response.json({error:'Invalid job request'},{status:400});
  return Response.json(await runConversionPage(body.data.cursor),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Dividend processing unavailable'},{status:503});}
}

export async function GET(request:Request){
 if(!jobAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await runScheduledTracking(),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Scheduled tracking unavailable'},{status:503});}
}
