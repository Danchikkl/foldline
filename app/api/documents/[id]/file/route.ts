import { createClient } from "@/lib/supabase/server";
import { presignDownload } from "@/lib/r2";
import { jsonError } from "@/lib/http";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return jsonError("Unauthorized",401);const{data:doc}=await supabase.from("documents").select("storage_key").eq("id",id).maybeSingle();if(!doc)return jsonError("Not found",404);return Response.json({url:await presignDownload(doc.storage_key,300)},{headers:{"cache-control":"no-store"}})}
