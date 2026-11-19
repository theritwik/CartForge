'use client';

import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import { FormField } from '@/components/auth/form-field';
import { FormError, SubmitButton } from '@/components/auth/form-parts';
import { paiseToRupeesInput, parseRupeesToPaise, slugFromName } from '@/lib/admin-format';
import type { AdminCategory, AdminProduct } from '@/lib/admin-api';
import { callApi } from '@/lib/api-client';
import type { FieldErrors } from '@/lib/auth-forms';

const savedProductSchema = z.object({ data: z.object({ id: z.string() }) });
const selectClass = 'bg-background border-border mt-1.5 w-full rounded-md border px-3 py-2 text-sm';

/** The product fields as typed, checked before anything is sent. The API validates again. */
function readForm(form: HTMLFormElement, isNew: boolean) {
  const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
  const errors: FieldErrors = {};

  const pricePaise = parseRupeesToPaise(values.price ?? '');
  if (pricePaise === null) {
    errors.price = 'Enter the price in rupees, for example 1299 or 1299.50';
  } else if (pricePaise < 100) {
    errors.price = 'The price must be at least ₹1';
  }
  if (!values.name?.trim()) errors.name = 'Enter a name';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug ?? '')) {
    errors.slug = 'Use lowercase letters, numbers, and single hyphens';
  }
  if (!values.description?.trim()) errors.description = 'Enter a description';
  if (!values.categoryId) errors.categoryId = 'Choose a category';

  let stockQuantity: number | undefined;
  if (isNew) {
    stockQuantity = Number(values.stockQuantity);
    if (!/^\d{1,7}$/.test(values.stockQuantity ?? '') || stockQuantity > 1_000_000) {
      errors.stockQuantity = 'Enter a whole number of units';
    }
  }

  return {
    errors,
    input: {
      name: values.name?.trim(),
      slug: values.slug,
      description: values.description?.trim(),
      pricePaise,
      categoryId: values.categoryId,
      ...(isNew ? { status: values.status, stockQuantity } : {}),
    },
  };
}

/** Maps API field names to the form's: the form asks for rupees, the API takes paise. */
function formFieldErrors(apiErrors: FieldErrors): FieldErrors {
  const { pricePaise, ...rest } = apiErrors;
  return pricePaise ? { ...rest, price: pricePaise } : rest;
}

export function ProductForm({
  product,
  categories,
}: {
  /** Absent when creating a product. */
  product?: AdminProduct;
  categories: AdminCategory[];
}) {
  const router = useRouter();
  const isNew = product === undefined;
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [isSlugEdited, setIsSlugEdited] = useState(!isNew);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [savedMessage, setSavedMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setSavedMessage(undefined);

    const { errors, input } = readForm(event.currentTarget, isNew);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    const result = isNew
      ? await callApi('POST', '/admin/products', input)
      : await callApi('PATCH', `/admin/products/${product.id}`, input);
    setIsSubmitting(false);

    if (!result.ok) {
      const errorsFromApi = formFieldErrors(result.fieldErrors);
      setFieldErrors(errorsFromApi);
      if (Object.keys(errorsFromApi).length === 0) {
        setFormError(result.message);
      }
      return;
    }
    if (isNew) {
      const saved = savedProductSchema.safeParse(result.data);
      router.push(saved.success ? `/admin/products/${saved.data.data.id}/edit` : '/admin/products');
      return;
    }
    setSavedMessage('Changes saved. The storefront shows them now.');
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
      <FormError message={formError} />
      <FormField
        name="name"
        label="Name"
        type="text"
        required
        maxLength={200}
        defaultValue={product?.name}
        onChange={(event) => {
          if (!isSlugEdited) {
            setSlug(slugFromName(event.target.value));
          }
        }}
        error={fieldErrors.name}
      />
      <FormField
        name="slug"
        label="URL slug"
        type="text"
        required
        maxLength={100}
        value={slug}
        onChange={(event) => {
          setIsSlugEdited(true);
          setSlug(event.target.value);
        }}
        hint="Used in the product's address: /products/your-slug."
        error={fieldErrors.slug}
      />
      <div>
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          maxLength={5000}
          defaultValue={product?.description}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? 'description-error' : undefined}
          className={`bg-background mt-1.5 w-full rounded-md border px-3 py-2 text-sm ${
            fieldErrors.description ? 'border-danger' : 'border-border'
          }`}
        />
        {fieldErrors.description && (
          <p id="description-error" className="text-danger mt-1.5 text-xs">
            {fieldErrors.description}
          </p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          name="price"
          label="Price (₹)"
          type="text"
          inputMode="decimal"
          required
          defaultValue={product ? paiseToRupeesInput(product.pricePaise) : ''}
          hint="Stored in paise. Past orders keep the price they were placed at."
          error={fieldErrors.price}
        />
        <div>
          <label htmlFor="categoryId" className="text-sm font-medium">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={product?.category.id ?? ''}
            aria-invalid={fieldErrors.categoryId ? true : undefined}
            aria-describedby={fieldErrors.categoryId ? 'categoryId-error' : undefined}
            className={selectClass}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {fieldErrors.categoryId && (
            <p id="categoryId-error" className="text-danger mt-1.5 text-xs">
              {fieldErrors.categoryId}
            </p>
          )}
        </div>
      </div>
      {isNew && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            name="stockQuantity"
            label="Units in stock"
            type="text"
            inputMode="numeric"
            required
            defaultValue="0"
            error={fieldErrors.stockQuantity}
          />
          <div>
            <label htmlFor="status" className="text-sm font-medium">
              Status
            </label>
            <select id="status" name="status" defaultValue="DRAFT" className={selectClass}>
              <option value="DRAFT">Draft (not visible in the store)</option>
              <option value="ACTIVE">Active (on sale)</option>
            </select>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-44">
          <SubmitButton
            isSubmitting={isSubmitting}
            label={isNew ? 'Create product' : 'Save changes'}
            submittingLabel="Saving…"
          />
        </div>
        <p role="status" className="text-sm empty:hidden">
          {savedMessage}
        </p>
      </div>
    </form>
  );
}
