import 'server-only';
import {sponsorConfig} from '../privy/sponsor';
import { rpc } from '../solana/rpc';
import { simulateTitanSwapWithRpc,prepareTitanSwapWithRpc } from './simulate-core';

export function simulateTitanSwap(args:Parameters<typeof simulateTitanSwapWithRpc>[1]) {
 return simulateTitanSwapWithRpc(rpc,{...args,sponsor:sponsorConfig().address});
}

export function prepareTitanSwap(args:Parameters<typeof prepareTitanSwapWithRpc>[1]) {return prepareTitanSwapWithRpc(rpc,{...args,sponsor:sponsorConfig().address});}
