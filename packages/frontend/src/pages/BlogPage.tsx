import { Link } from "react-router-dom";
import { BLOG_POSTS } from "../data/blog-posts";

export default function BlogPage() {
  return (
    <main className="px-6 py-20 mx-auto" style={{ maxWidth: 900 }}>
      <div className="caps text-accent-ink mb-4">◆ Journal</div>
      <h1
        className="serif font-normal italic mb-16"
        style={{
          fontSize: "clamp(48px, 6vw, 84px)",
          lineHeight: 0.95,
          letterSpacing: "-0.02em",
        }}
      >
        From the kitchen.
      </h1>

      <div className="flex flex-col gap-0">
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}`}
            className="group block border-t border-rule py-8 transition-colors"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="flex justify-between items-baseline gap-8 mb-3">
              <div
                className="caps text-ink-3"
                style={{ flexShrink: 0 }}
              >
                ◆ {post.figLabel}
              </div>
              <div
                className="mono text-ink-3"
                style={{ fontSize: 11, flexShrink: 0 }}
              >
                {new Date(post.date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
            <h2
              className="serif font-normal italic group-hover:text-accent transition-colors"
              style={{
                fontSize: "clamp(28px, 4vw, 48px)",
                lineHeight: 1.05,
                letterSpacing: "-0.015em",
                margin: 0,
              }}
            >
              {post.title}
            </h2>
            <p
              className="mt-3 text-ink-2"
              style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 640 }}
            >
              {post.subtitle}
            </p>
            <div
              className="mono mt-4 text-ink-3 group-hover:text-ink-2 transition-colors"
              style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Read &rarr;
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
