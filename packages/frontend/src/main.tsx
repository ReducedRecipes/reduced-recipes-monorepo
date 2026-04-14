import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import RecipePage from "./pages/RecipePage";
import "./index.css";

// Lazy-loaded page placeholders (actual pages added in later stories)
const Placeholder = ({ name }: { name: string }) => (
  <div className="p-8 text-center text-gray-500">{name} — coming soon</div>
);

const HomePage = () => <Placeholder name="Home" />;
const SearchPage = () => <Placeholder name="Search" />;
const TagPage = () => <Placeholder name="Tag" />;
const CuisinePage = () => <Placeholder name="Cuisine" />;
const DomainPage = () => <Placeholder name="Domain" />;
const RemovePage = () => <Placeholder name="Remove" />;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/recipe/:id" element={<RecipePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/tag/:tag" element={<TagPage />} />
            <Route path="/cuisine/:cuisine" element={<CuisinePage />} />
            <Route path="/site/:domain" element={<DomainPage />} />
            <Route path="/remove" element={<RemovePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
