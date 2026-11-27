import { Product, type ProductId, type ProductInput } from '@px/contracts';
import { boardgame } from './boardgame';
import { glossy } from './glossy';
import { shezhire } from './shezhire';

/** Add a product: create a file next to this one and list it here. */
const definitions: ProductInput[] = [glossy, shezhire, boardgame];

export class ProductRegistry {
  private readonly products: ReadonlyMap<ProductId, Product>;

  constructor(inputs: ProductInput[] = definitions) {
    const map = new Map<ProductId, Product>();
    for (const input of inputs) {
      // Definitions are validated at startup: a typo in a price or field fails the deploy, not a customer.
      const product = Product.parse(input);
      if (map.has(product.id)) throw new Error(`Duplicate product id "${product.id}"`);
      map.set(product.id, product);
    }
    this.products = map;
  }

  list(): Product[] {
    return [...this.products.values()];
  }

  get(id: ProductId): Product | undefined {
    return this.products.get(id);
  }
}
