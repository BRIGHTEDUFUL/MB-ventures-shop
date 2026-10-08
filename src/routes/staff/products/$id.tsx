import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { storeQuery, pageHead } from "@/lib/store";
import { ProductForm } from "@/components/staff/product-form";

export const Route = createFileRoute("/staff/products/$id")({
  head: () =>
    pageHead("Edit product", "Update pricing, stock, photos, description and specifications."),
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const store = useQuery(storeQuery);

  if (store.isPending) return <p className="text-sm text-muted-foreground">Loading product…</p>;
  if (store.isError) {
    return <p role="alert">The catalogue could not load. Reload the page to try again.</p>;
  }

  const product = store.data.products.find((p) => p.id === id);
  if (!product) {
    return (
      <div>
        <Link to="/staff/products" className="text-sm text-link hover:underline">
          ← Back to products
        </Link>
        <p role="alert" className="mt-4">
          That product no longer exists. It may have been removed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link to="/staff/products" className="text-sm text-link hover:underline">
        ← Back to products
      </Link>
      <div className="mt-4">
        <ProductForm
          product={product}
          categories={store.data.categories}
          onSaved={() => navigate({ to: "/staff/products" })}
          onCancel={() => navigate({ to: "/staff/products" })}
        />
      </div>
    </div>
  );
}
