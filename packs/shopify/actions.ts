/**
 * Shopify Pack - Action Definitions
 */

import { ActionDef } from '../../kernel/src/types';

export const shopifyActions: ActionDef[] = [
  {
    name: 'shopify.products.list',
    scope: 'manage.read',
    description: 'List Shopify products for a tenant',
    params_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 250 },
        cursor: { type: 'string' },
        query: { type: 'string' },
      },
      required: [],
    },
    supports_dry_run: false,
  },
  {
    name: 'shopify.products.get',
    scope: 'manage.read',
    description: 'Get a single Shopify product by ID',
    params_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
      },
      required: ['product_id'],
    },
    supports_dry_run: false,
  },
  {
    name: 'shopify.products.create',
    scope: 'manage.write',
    description: 'Create a new Shopify product',
    params_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        vendor: { type: 'string' },
        product_type: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              price: { type: 'string' },
              sku: { type: 'string' },
              inventory_quantity: { type: 'number' },
            },
          },
        },
      },
      required: ['title'],
    },
    supports_dry_run: true,
  },
  {
    name: 'shopify.products.update',
    scope: 'manage.write',
    description: 'Update an existing Shopify product',
    params_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        vendor: { type: 'string' },
        product_type: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['product_id'],
    },
    supports_dry_run: true,
  },
  {
    name: 'shopify.products.delete',
    scope: 'manage.write',
    description: 'Delete a Shopify product',
    params_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
      },
      required: ['product_id'],
    },
    supports_dry_run: true,
  },
  {
    name: 'shopify.orders.list',
    scope: 'manage.read',
    description: 'List Shopify orders for a tenant',
    params_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 250 },
        cursor: { type: 'string' },
        status: { type: 'string' },
        financial_status: { type: 'string' },
        created_at_min: { type: 'string', format: 'date-time' },
        created_at_max: { type: 'string', format: 'date-time' },
      },
      required: [],
    },
    supports_dry_run: false,
  },
  {
    name: 'shopify.orders.get',
    scope: 'manage.read',
    description: 'Get a single Shopify order by ID',
    params_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
      },
      required: ['order_id'],
    },
    supports_dry_run: false,
  },
  {
    name: 'shopify.orders.create',
    scope: 'manage.write',
    description: 'Create a new Shopify order',
    params_schema: {
      type: 'object',
      properties: {
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variant_id: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['variant_id', 'quantity'],
          },
        },
        email: { type: 'string', format: 'email' },
        shipping_address: { type: 'object' },
        billing_address: { type: 'object' },
      },
      required: ['line_items'],
    },
    supports_dry_run: true,
  },
  {
    name: 'shopify.orders.cancel',
    scope: 'manage.write',
    description: 'Cancel a Shopify order',
    params_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['order_id'],
    },
    supports_dry_run: true,
  },
];
