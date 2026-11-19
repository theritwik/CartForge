'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type SubmitEvent } from 'react';
import { slugFromName } from '@/lib/admin-format';
import type { AdminCategory } from '@/lib/admin-api';
import { callApi } from '@/lib/api-client';
import { formText, type FieldErrors } from '@/lib/auth-forms';

const inputClass = 'bg-background rounded-md border px-3 py-1.5 text-sm';
const quietButton =
  'text-muted hover:text-foreground text-sm underline underline-offset-4 disabled:opacity-60';

function readCategory(form: HTMLFormElement): { name: string; slug: string; errors: FieldErrors } {
  const name = formText(form, 'name').trim();
  const slug = formText(form, 'slug').trim();
  const errors: FieldErrors = {};
  if (!name) errors.name = 'Enter a name';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    errors.slug = 'Use lowercase letters, numbers, and hyphens';
  return { name, slug, errors };
}

function FieldMessage({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="text-danger mt-1 text-xs">
      {message}
    </p>
  ) : null;
}

function CategoryFields({
  idPrefix,
  name,
  slug,
  errors,
  onNameChange,
  onSlugChange,
}: {
  idPrefix: string;
  name: string;
  slug: string;
  errors: FieldErrors;
  onNameChange: (name: string) => void;
  onSlugChange: (slug: string) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-name`} className="text-muted text-xs">
          Name
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
          maxLength={100}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${idPrefix}-name-error` : undefined}
          className={`${inputClass} mt-1 block w-full ${errors.name ? 'border-danger' : 'border-border'}`}
        />
        <FieldMessage id={`${idPrefix}-name-error`} message={errors.name} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-slug`} className="text-muted text-xs">
          Slug
        </label>
        <input
          id={`${idPrefix}-slug`}
          name="slug"
          value={slug}
          onChange={(event) => {
            onSlugChange(event.target.value);
          }}
          maxLength={100}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={errors.slug ? `${idPrefix}-slug-error` : undefined}
          className={`${inputClass} mt-1 block w-full ${errors.slug ? 'border-danger' : 'border-border'}`}
        />
        <FieldMessage id={`${idPrefix}-slug-error`} message={errors.slug} />
      </div>
    </>
  );
}

function NewCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const input = readCategory(event.currentTarget);
    setErrors(input.errors);
    if (Object.keys(input.errors).length > 0) {
      return;
    }
    setIsSaving(true);
    const result = await callApi('POST', '/admin/categories', {
      name: input.name,
      slug: input.slug,
    });
    setIsSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      if (Object.keys(result.fieldErrors).length === 0) setError(result.message);
      return;
    }
    setName('');
    setSlug('');
    setIsSlugEdited(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      aria-labelledby="new-category-heading"
      className="border-border rounded-lg border p-5"
    >
      <h2 id="new-category-heading" className="font-medium">
        New category
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <CategoryFields
          idPrefix="new-category"
          name={name}
          slug={slug}
          errors={errors}
          onNameChange={(value) => {
            setName(value);
            if (!isSlugEdited) setSlug(slugFromName(value));
          }}
          onSlugChange={(value) => {
            setIsSlugEdited(true);
            setSlug(value);
          }}
        />
        <button
          type="submit"
          disabled={isSaving}
          className="bg-foreground text-background rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-60 sm:mt-5"
        >
          {isSaving ? 'Adding…' : 'Add category'}
        </button>
      </div>
      <p role="alert" className="text-danger mt-3 text-sm empty:hidden">
        {error}
      </p>
    </form>
  );
}

function CategoryRow({ category }: { category: AdminCategory }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const input = readCategory(event.currentTarget);
    setErrors(input.errors);
    if (Object.keys(input.errors).length > 0) return;
    setIsSaving(true);
    const result = await callApi('PATCH', `/admin/categories/${category.id}`, {
      name: input.name,
      slug: input.slug,
    });
    setIsSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      if (Object.keys(result.fieldErrors).length === 0) setError(result.message);
      return;
    }
    setMode('view');
    router.refresh();
  }

  async function remove() {
    setIsSaving(true);
    setError(undefined);
    const result = await callApi('DELETE', `/admin/categories/${category.id}`);
    setIsSaving(false);
    setMode('view');
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return (
    <li className="px-5 py-4">
      {mode === 'edit' ? (
        <form
          onSubmit={(event) => void save(event)}
          noValidate
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
        >
          <CategoryFields
            idPrefix={`category-${category.id}`}
            name={name}
            slug={slug}
            errors={errors}
            onNameChange={setName}
            onSlugChange={setSlug}
          />
          <div className="flex gap-3 sm:mt-5">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-foreground text-background rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('view');
                setName(category.name);
                setSlug(category.slug);
                setErrors({});
              }}
              className={quietButton}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div>
            <p className="font-medium">{category.name}</p>
            <p className="text-muted text-sm">
              /{category.slug} · {category.productCount}{' '}
              {category.productCount === 1 ? 'product' : 'products'}, {category.activeProductCount}{' '}
              active
            </p>
          </div>
          {mode === 'confirm-delete' ? (
            <div
              role="group"
              aria-label={`Confirm deleting ${category.name}`}
              className="flex flex-wrap items-center gap-3"
            >
              <span className="text-sm">Delete this category?</span>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={isSaving}
                autoFocus
                className="border-danger text-danger rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                {isSaving ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('view');
                }}
                className={quietButton}
              >
                Keep
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Link href={`/admin/products?categoryId=${category.id}`} className={quietButton}>
                View products
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMode('edit');
                }}
                className={quietButton}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('confirm-delete');
                }}
                disabled={category.productCount > 0}
                title={
                  category.productCount > 0 ? 'Only empty categories can be deleted' : undefined
                }
                className={quietButton}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      <p role="alert" className="text-danger mt-2 text-sm empty:hidden">
        {error}
      </p>
    </li>
  );
}

export function CategoryManager({ categories }: { categories: AdminCategory[] }) {
  return (
    <div className="space-y-8">
      <NewCategoryForm />
      {categories.length === 0 ? (
        <p className="text-muted text-sm">No categories yet.</p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {categories.map((category) => (
            <CategoryRow
              key={`${category.id}-${category.name}-${category.slug}`}
              category={category}
            />
          ))}
        </ul>
      )}
      <p className="text-muted text-xs">
        A category can be deleted only when it holds no products, including archived ones.
      </p>
    </div>
  );
}
