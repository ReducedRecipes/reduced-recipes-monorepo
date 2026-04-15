import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">Page not found</h1>
      <p className="text-gray-600 mb-6">
        Sorry, the page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="text-amber-600 hover:text-amber-700 underline font-medium"
      >
        Go back to homepage
      </Link>
    </div>
  );
}
