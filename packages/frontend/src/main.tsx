import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import "./index.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const RecipePage = lazy(() => import("./pages/RecipePage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const TagPage = lazy(() => import("./pages/TagPage"));
const CuisinePage = lazy(() => import("./pages/CuisinePage"));
const DomainPage = lazy(() => import("./pages/DomainPage"));
const RemovePage = lazy(() => import("./pages/RemovePage"));

const Loading = () => (
  <div className="p-8 text-center text-gray-500">Loading...</div>
);

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
            <Route path="/" element={<Suspense fallback={<Loading />}><HomePage /></Suspense>} />
            <Route path="/recipe/:id" element={<Suspense fallback={<Loading />}><RecipePage /></Suspense>} />
            <Route path="/search" element={<Suspense fallback={<Loading />}><SearchPage /></Suspense>} />
            <Route path="/tag/:tag" element={<Suspense fallback={<Loading />}><TagPage /></Suspense>} />
            <Route path="/cuisine/:cuisine" element={<Suspense fallback={<Loading />}><CuisinePage /></Suspense>} />
            <Route path="/site/:domain" element={<Suspense fallback={<Loading />}><DomainPage /></Suspense>} />
            <Route path="/remove" element={<Suspense fallback={<Loading />}><RemovePage /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
