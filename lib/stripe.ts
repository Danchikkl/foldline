import Stripe from "stripe";
import { env } from "@/lib/env";

export function stripeClient() {
  return new Stripe(env.stripeSecretKey(), {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
