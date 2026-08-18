import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin, jsonError } from "@/lib/http";
import { stripeClient } from "@/lib/stripe";
import { env } from "@/lib/env";
export async function POST(request:Request){try{assertSameOrigin(request)}catch(r){return r as Response}const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return jsonError("Unauthorized",401);const{data:sub}=await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id",user.id).maybeSingle();if(!sub?.stripe_customer_id)return jsonError("No Stripe customer exists yet.",404);const session=await stripeClient().billingPortal.sessions.create({customer:sub.stripe_customer_id,return_url:`${env.appUrl()}/settings/billing`});return Response.json({url:session.url})}
