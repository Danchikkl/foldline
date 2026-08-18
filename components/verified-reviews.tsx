export type VerifiedReview = { quote: string; name: string; role: string; company?: string };

// Keep this list empty until a real customer explicitly approves a public quote.
const reviews: VerifiedReview[] = [];

export function VerifiedReviews() {
  if (reviews.length === 0) return null;
  return <section className="reviewsSection" aria-labelledby="reviews-title"><div className="container"><span className="eyebrow">Verified customer reviews</span><h2 id="reviews-title">Used by people who review documents for real.</h2><div className="reviewsGrid">{reviews.map((review) => <figure className="reviewQuote" key={`${review.name}-${review.quote}`}><blockquote>“{review.quote}”</blockquote><figcaption><strong>{review.name}</strong><span>{review.role}{review.company ? ` · ${review.company}` : ""}</span></figcaption></figure>)}</div></div></section>;
}
