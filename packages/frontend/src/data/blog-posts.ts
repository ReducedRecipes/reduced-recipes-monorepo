export interface BlogPost {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  author: string;
  figLabel: string;
  content: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "whos-actually-extracting-value-from-recipe-creators",
    title: "Who's Actually Extracting Value From Recipe Creators",
    subtitle: "The real parasites of the recipe web, and why the system is broken for everyone except the middlemen",
    date: "2026-04-24",
    author: "Jannik Richter",
    figLabel: "Fig. 001",
    content: `You searched for a chocolate chip cookie recipe. You scrolled past three autoplaying videos, two cookie banner popups, a newsletter signup, an 800-word story about the author's grandmother, four inline ad placements, and finally arrived at the ingredients. Somewhere between you opening the page and you reading the ingredient list, someone made money. But if you think that money went to the home cook who developed the recipe, you've been misled about how this industry actually works.

This piece is about where the money goes.

## The Publishers

Let's start with the biggest single example. Taste of Home presents itself as a network of home cooks sharing their family recipes. The reality is that Taste of Home is owned by Trusted Media Brands, Inc., formerly the Reader's Digest Association, one of the largest publishing conglomerates in North America.

Their own published contributor guidelines include this language, available on tasteofhome.com:

> "By submitting material for publication, you grant RDA Enthusiast Brands, LLC, its parent company, subsidiaries, affiliates, partners and licensees unrestricted use of the material, including your name, hometown and state. We reserve the right to modify, reproduce and distribute the material in any medium and in any manner."

A home cook submits her grandmother's recipe hoping to see her name in a magazine. What she signs, according to the publisher's own terms, is an unrestricted grant of commercial rights to a corporate publisher in perpetuity. That recipe can now be syndicated, repackaged into cookbooks, licensed to third parties, included in subscription products, and wrapped in advertising. Home cooks are not paid for submissions. They enter contests for prizes. Trusted Media Brands monetises the submitted content indefinitely.

This is legal. It is clearly disclosed. It is also the deal the industry's biggest recipe brand extends to the "home cooks" it markets itself as celebrating.

## The Ad Networks

Above the publisher tier sits the advertising technology layer. The two dominant players in the food blogging space are Mediavine and Raptive (formerly AdThrive). Both publish their revenue split publicly: they take 25% of ad revenue as a management fee. Mediavine offers a 1% loyalty bonus per year up to year five. Raptive uses the same 25% base rate.

To qualify for either network, a blogger needs to hit a traffic threshold, roughly 50,000 monthly sessions for Mediavine, 100,000 for Raptive. Below these thresholds, creators are stuck with Google AdSense, where typical revenue per thousand views sits at a fraction of what the premium networks pay.

Public income reports from food bloggers show the practical impact. One widely cited example is a blogger whose AdSense income stalled at a few hundred dollars per month, then jumped to over $4,700 per month almost immediately after switching to a premium network at the same traffic level. The work didn't change. The audience didn't change. Only the intermediary did.

This is the layer where most of a creator's monetisation potential is actually captured. Ad networks are not villains in a moral sense. They provide a real service, optimising ad placement and handling relationships with advertisers. But the 25% cut is taken from the creator's revenue in perpetuity on every impression, regardless of how the creator's audience grows or how much the underlying platform improves.

## The Search Layer

Above both the publisher and the ad network tiers sits Google. Google Search determines which recipes get found and which don't. Google's ranking algorithm, by the well-documented observation of bloggers who depend on it, rewards long-form content, high dwell time, and heavy use of structured markup.

The result is the pattern every reader knows. A recipe that could be expressed in 200 words becomes a 2,000-word essay. The essay contains personal narrative, childhood memories, tasting notes, FAQ sections, substitution charts, and nutritional information, because all of that content increases the ranking probability. The recipe itself, the ingredients and the steps, sits near the bottom of the page.

Food bloggers routinely describe this publicly in their own income reports. They do not prefer to write this way. They have extensively described the creative cost of producing content optimised for an algorithm rather than a reader. They produce it because the economic pressure leaves no alternative. Google's ranking preferences shape the product every user hates, and users blame the creators for it.

Google has also, more recently, introduced AI Overviews into search results. These overviews summarise content from ranked pages directly in the search result, reducing the click-through rate to the source. In Europe, publishers are pursuing legal action over this practice on the basis that it extracts value from creators without compensation. In the United States, the New York Times and others have litigation active against related use of their content to train AI models. The pattern across these cases is consistent: the platform that originally drove traffic to creators is increasingly keeping the value of that traffic for itself.

## The Extraction Stack

Stacked end to end, the recipe web looks like this. At the bottom is the creator, typically an individual or a small team. Above them is the ad network, taking 25% off every impression. Above that is the publisher (for creators working under a publishing brand), often holding unrestricted rights to the underlying content. Above all of that is Google, controlling discovery and increasingly summarising the content directly into its own product.

At each layer, value is extracted. The creator sits at the bottom of this stack, required to produce content optimised for Google, monetised by an ad network, potentially owned by a publisher, and increasingly summarised by Google's own AI before users ever click through. The 2,000-word story wrapped around the ingredient list is not the creator's preference. It is the visible output of a system none of them individually designed and none of them individually benefit from fixing.

## The User's Role

The user is positioned in this conversation as the villain. Every time someone uses an ad blocker, a recipe app, or a cleaner reader tool, the argument is made that they are stealing from creators. This framing is backward.

The user did not design this system. The user does not benefit from 2,000-word essays before ingredient lists. The user is paying for the content with their attention, their data, and their time, and receiving in exchange a product that the creators themselves do not want to produce.

A user who routes around the bloated recipe page is not extracting value from the creator. They are refusing to subsidise a system that is extracting value from both of them simultaneously.

## What a Better System Looks Like

The question worth asking is not how to protect the current system, but how to build one that works. A better system would compensate creators directly rather than through layers of intermediaries. It would reward quality rather than length. It would attribute content properly and drive traffic back to sources rather than summarising them away. It would give users what they actually came for.

There are some emerging models that suggest what this could look like. Direct reader subscriptions, through platforms like Substack and Patreon, let creators bypass the ad tech stack entirely. Recipe-focused apps like Paprika let users pay once for a tool that respects their time. Some food bloggers have started publishing clean, structured recipes alongside their longer content, effectively giving readers the choice. A handful of aggregators are experimenting with cleaner presentation while driving attributed traffic to original sources.

Reduced Recipes is one of these experiments. It strips recipes to just the ingredients and method, attributes every recipe by author and domain, and links back prominently. It exists because the current recipe web is failing both users and creators, and because facts (ingredients, quantities, method steps) are not copyrightable in US law and should not be treated as proprietary. Your grandmother's ingredient list is not a trade secret. The prose your grandmother wrote around it, if she wrote any, is hers. That distinction is the foundation of a system where creators keep their creative expression and users get unobstructed access to the factual core.

The recipe web doesn't need more content. It needs less extraction.`,
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
