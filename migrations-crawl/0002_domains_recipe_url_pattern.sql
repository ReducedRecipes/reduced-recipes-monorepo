-- Per-domain recipe-URL pattern.
--
-- Some recipe sites use "clean" URLs like https://example.com/aloo-paratha/
-- that don't contain /recipe/, /recipes/, /dish/, etc. The default
-- isRecipeUrl heuristic in @rr/shared/sitemap.ts misses them and the
-- spider ends up with `inserted: 0` for those domains.
--
-- This column holds an optional regex (matched against URL pathname). When
-- set, the spider uses it instead of the default path-segment heuristic.
-- When NULL, the default heuristic still applies — backwards compatible.
--
-- Examples:
--   indianhealthyrecipes.com  =>  ^/[a-z0-9-]+/?$
--   bbcgoodfood.com           =>  ^/recipes/
--   sallysbakingaddiction.com =>  (leave NULL, default works)

ALTER TABLE domains ADD COLUMN recipe_url_pattern TEXT;
