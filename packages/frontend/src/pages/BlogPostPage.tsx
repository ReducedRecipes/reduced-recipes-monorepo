import { useParams, Link } from "react-router-dom";
import { getBlogPost } from "../data/blog-posts";

function renderContent(content: string) {
  const blocks: { type: string; text: string }[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3) });
      i++;
    } else if (line.startsWith("> ")) {
      let quote = line.slice(2);
      i++;
      while (i < lines.length && (lines[i] ?? "").startsWith("> ")) {
        quote += " " + (lines[i] ?? "").slice(2);
        i++;
      }
      blocks.push({ type: "quote", text: quote });
    } else if (line.trim() === "") {
      i++;
    } else {
      let para = line;
      i++;
      let next = lines[i] ?? "";
      while (i < lines.length && next.trim() !== "" && !next.startsWith("## ") && !next.startsWith("> ")) {
        para += " " + next;
        i++;
        next = lines[i] ?? "";
      }
      blocks.push({ type: "p", text: para });
    }
  }

  return blocks.map((block, idx) => {
    if (block.type === "h2") {
      return (
        <h2
          key={idx}
          className="serif font-normal italic mt-16 mb-6"
          style={{
            fontSize: "clamp(28px, 3.5vw, 44px)",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
          }}
        >
          {block.text}
        </h2>
      );
    }
    if (block.type === "quote") {
      return (
        <blockquote
          key={idx}
          className="my-6"
          style={{
            borderLeft: "3px solid var(--accent)",
            paddingLeft: 20,
            fontStyle: "italic",
            color: "var(--ink-2)",
            fontSize: 16,
            lineHeight: 1.7,
          }}
        >
          {block.text}
        </blockquote>
      );
    }
    return (
      <p key={idx} className="text-ink-2" style={{ fontSize: 18, lineHeight: 1.7, marginBottom: 20 }}>
        {block.text}
      </p>
    );
  });
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getBlogPost(slug) : undefined;

  if (!post) {
    return (
      <main className="px-6 py-20 mx-auto text-center" style={{ maxWidth: 900 }}>
        <h1 className="serif italic text-ink-3" style={{ fontSize: 36 }}>Post not found</h1>
        <Link to="/blog" className="mono mt-6 inline-block text-ink-3" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          &larr; Back to journal
        </Link>
      </main>
    );
  }

  return (
    <main className="px-6 py-20 mx-auto" style={{ maxWidth: 740 }}>
      <Link
        to="/blog"
        className="mono text-ink-3 hover:text-ink-2 transition-colors inline-block mb-12"
        style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
      >
        &larr; Journal
      </Link>

      <div className="caps text-accent-ink mb-4">◆ {post.figLabel}</div>
      <h1
        className="serif font-normal italic mb-4"
        style={{
          fontSize: "clamp(36px, 5vw, 64px)",
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {post.title}
      </h1>
      <p className="text-ink-2 mb-8" style={{ fontSize: 18, lineHeight: 1.5 }}>
        {post.subtitle}
      </p>
      <div
        className="flex gap-6 items-center mb-14 pb-8 border-b border-rule"
      >
        <span className="mono text-ink-3" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {post.author}
        </span>
        <span className="mono text-ink-3" style={{ fontSize: 11 }}>
          {new Date(post.date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      <article>
        {renderContent(post.content)}
      </article>

      <div className="mt-20 pt-8 border-t border-rule">
        <Link
          to="/blog"
          className="mono text-ink-3 hover:text-ink-2 transition-colors"
          style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}
        >
          &larr; Back to journal
        </Link>
      </div>
    </main>
  );
}
