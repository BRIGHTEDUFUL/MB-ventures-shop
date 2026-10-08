import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { storeQuery, pageHead } from "@/lib/store";
import { ProductForm } from "@/components/staff/product-form";

export const Route = createFileRoute("/staff/products/new")({
  head: () =>
    pageHead("Add product", "Create a new catalogue listing with photos, specs and stock."),
  component: NewProduct,
});

function NewProduct() {
  const navigate = useNavigate();
  const store = useQuery(storeQuery);

  if (store.isPending) return <p className="text-sm text-muted-foreground">Loading catalogue…</p>;
  if (store.isError) {
    return <p role="alert">The catalogue could not load. Reload the page to try again.</p>;
  }

  return (
    <div>
      <Link to="/staff/products" className="text-sm text-link hover:underline">
        ← Back to products
      </Link>
      <div className="mt-4">
        <ProductForm
          categories={store.data.categories}
          onSaved={() => navigate({ to: "/staff/products" })}
          onCancel={() => navigate({ to: "/staff/products" })}
        />
      </div>
    </div>
  );
}
