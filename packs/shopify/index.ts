/**
 * Shopify Pack - Main Export
 */

import { Pack } from '../../kernel/src/pack';
import { shopifyActions } from './actions';
import {
  handleShopifyProductsList,
  handleShopifyProductsGet,
  handleShopifyProductsCreate,
  handleShopifyProductsUpdate,
  handleShopifyProductsDelete,
  handleShopifyOrdersList,
  handleShopifyOrdersGet,
  handleShopifyOrdersCreate,
  handleShopifyOrdersCancel,
} from './handlers';

export const shopifyPack: Pack = {
  name: 'shopify',
  actions: shopifyActions,
  handlers: {
    'shopify.products.list': handleShopifyProductsList,
    'shopify.products.get': handleShopifyProductsGet,
    'shopify.products.create': handleShopifyProductsCreate,
    'shopify.products.update': handleShopifyProductsUpdate,
    'shopify.products.delete': handleShopifyProductsDelete,
    'shopify.orders.list': handleShopifyOrdersList,
    'shopify.orders.get': handleShopifyOrdersGet,
    'shopify.orders.create': handleShopifyOrdersCreate,
    'shopify.orders.cancel': handleShopifyOrdersCancel,
  },
};
