"use client";

import {
  saveProduct,
  saveProductRemote,
  setProductActive,
  setProductActiveRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { Product } from "@bookit/types";
import { can, formatMoney } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceProductsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", categoryId: state.productCategories[0]?.id ?? "cat_beauty", price: "36", stock: "20" });
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "products.manage");
  const products = state.products.filter((p) => p.businessId === bizId);

  function openModal(product?: Product) {
    if (product) {
      setForm({
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        price: String(product.price),
        stock: String(product.stock),
      });
      setEditing(product);
    } else {
      setForm({ name: "", description: "", categoryId: state.productCategories[0]?.id ?? "cat_beauty", price: "36", stock: "20" });
      setEditing("new");
    }
    setError("");
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Products Management</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Sell physical goods alongside bookings in the BookIt marketplace.
          </p>
        </div>
        {canManage ? <Button onClick={() => openModal()}>+ Add Product</Button> : null}
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {pageError ? <p className="error">{pageError}</p> : null}

      {products.length === 0 ? (
        <Empty title="No products yet" body="Add a physical product to list it on the BookIt marketplace." />
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const cat = state.productCategories.find((c) => c.id === product.categoryId);
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="person">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }}
                        />
                        <strong>{product.name}</strong>
                      </div>
                    </td>
                    <td className="tiny">{cat?.name ?? "General"}</td>
                    <td className="tabular">{formatMoney(product.price)}</td>
                    <td className="tabular">{product.stock}</td>
                    <td>
                      <Badge tone={product.active ? "success" : "neutral"}>{product.active ? "Active" : "Disabled"}</Badge>
                    </td>
                    {canManage ? (
                      <td>
                        <div className="row">
                          <Button tone="soft" small disabled={busy} onClick={() => openModal(product)}>
                            Edit
                          </Button>
                          <Button
                            tone="ghost"
                            small
                            disabled={busy}
                            onClick={async () => {
                              setPageError("");
                              setNotice("");
                              setBusy(true);
                              try {
                                const res = usingMocks()
                                  ? setProductActive(bizId, product.id, !product.active)
                                  : await setProductActiveRemote(bizId, product.id, !product.active);
                                if (!res.ok) {
                                  setPageError(res.error);
                                  return;
                                }
                                setNotice(`${product.name} ${product.active ? "disabled" : "enabled"}.`);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {product.active ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <Modal title={editing === "new" ? "Add Product" : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setPageError("");
              setNotice("");
              setBusy(true);
              try {
                const productId = editing === "new" ? undefined : editing.id;
                const res = usingMocks()
                  ? saveProduct(bizId, form, productId)
                  : await saveProductRemote(bizId, form, productId);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setEditing(null);
                setNotice(productId ? "Product updated." : "Product created.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {state.productCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid-2">
              <Field label="Price ($)">
                <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Stock">
                <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save product"}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
