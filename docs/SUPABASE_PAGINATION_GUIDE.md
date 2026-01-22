# Supabase Pagination Best Practices

**Purpose:** Guide for handling large datasets in Supabase queries  
**Date:** 2026-01-22

---

## The 1000-Row Limit Problem

### Default Behavior
Supabase (PostgREST) returns **maximum 1000 rows** per query by default.

```javascript
// ❌ BAD - Only returns first 1000 rows
const { data } = await supabase
    .from('case_products')
    .select('*');
// Result: data.length = 1000 (even if table has 10,000 rows)
```

### Why This Happens
- PostgREST default limit: 1000 rows
- No error is thrown - query succeeds but data is truncated
- Silent failure - hard to detect in production

---

## Solution 1: Range Pagination (Recommended)

### Basic Usage
```javascript
// ✅ GOOD - Load all rows in batches
const allRows = [];
const BATCH_SIZE = 1000;
let offset = 0;
let hasMore = true;

while (hasMore) {
    const { data, error } = await supabase
        .from('case_products')
        .select('*')
        .range(offset, offset + BATCH_SIZE - 1);
    
    if (data && data.length > 0) {
        allRows.push(...data);
        offset += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
    } else {
        hasMore = false;
    }
}
```

### How It Works
- `.range(start, end)` - Inclusive range (0-based indexing)
- `.range(0, 999)` - Returns rows 0-999 (1000 rows)
- `.range(1000, 1999)` - Returns rows 1000-1999 (next 1000 rows)
- Loop until `data.length < BATCH_SIZE` (last page)

---

## Solution 2: Filter First, Then Paginate

### The Problem
```javascript
// ❌ BAD - Loads ALL products, hits 1000-row limit
const { data: products } = await supabase
    .from('case_products')
    .select('*');

// Then filter in JavaScript
const myProducts = products.filter(p => myCaseIds.includes(p.case_id));
```

### The Solution
```javascript
// ✅ GOOD - Filter in database first
const { data: cases } = await supabase
    .from('cases')
    .select('id')
    .eq('submitted_by_id', myEmployeeId);

const caseIds = cases.map(c => c.id);

// Then load products ONLY for those cases
const { data: products } = await supabase
    .from('case_products')
    .select('*')
    .in('case_id', caseIds);
```

### Benefits
- Reduces data transfer (only relevant rows)
- Faster queries (database does filtering)
- Less likely to hit 1000-row limit

---

## Solution 3: Batch `.in()` Filters

### The `.in()` Limit Problem
Supabase `.in()` has a limit of ~1000 items in the array.

```javascript
// ❌ BAD - Fails if caseIds.length > 1000
const { data } = await supabase
    .from('case_products')
    .select('*')
    .in('case_id', caseIds); // Error if caseIds has 2000 items
```

### The Solution
```javascript
// ✅ GOOD - Batch the .in() filter
const allProducts = [];
const BATCH_SIZE = 500; // Use 500 to be safe

for (let i = 0; i < caseIds.length; i += BATCH_SIZE) {
    const batchIds = caseIds.slice(i, i + BATCH_SIZE);
    
    const { data } = await supabase
        .from('case_products')
        .select('*')
        .in('case_id', batchIds);
    
    if (data) {
        allProducts.push(...data);
    }
}
```

---

## Solution 4: Combined Approach (Most Robust)

### When to Use
- Loading data for admin/manager views (many cases)
- Each case has multiple products
- Total products > 1000

### Implementation
```javascript
async function loadAllCaseProducts(caseIds) {
    const allProducts = [];
    const CASE_BATCH_SIZE = 500; // Batch case IDs
    const PRODUCT_BATCH_SIZE = 1000; // Batch products

    // Batch 1: Split case IDs into chunks
    for (let i = 0; i < caseIds.length; i += CASE_BATCH_SIZE) {
        const batchIds = caseIds.slice(i, i + CASE_BATCH_SIZE);
        
        // Batch 2: Paginate products for each chunk
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data } = await supabase
                .from('case_products')
                .select('*')
                .in('case_id', batchIds)
                .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

            if (data && data.length > 0) {
                allProducts.push(...data);
                offset += PRODUCT_BATCH_SIZE;
                hasMore = data.length === PRODUCT_BATCH_SIZE;
            } else {
                hasMore = false;
            }
        }
    }

    return allProducts;
}
```

### Why This Works
- ✅ Handles unlimited case IDs (batches of 500)
- ✅ Handles unlimited products per batch (pagination)
- ✅ Never hits `.in()` limit
- ✅ Never hits 1000-row limit
- ✅ Scales to millions of rows

---

## Performance Comparison

### Scenario: 5,000 cases, 15,000 products

| Approach | Queries | Time | Data Loaded | Issues |
|----------|---------|------|-------------|--------|
| **No pagination** | 1 | 0.5s | 1,000 products | ❌ Missing 14,000 products |
| **Filter first** | 2 | 1s | 1,000 products | ❌ Still missing data |
| **Range pagination** | 15 | 3s | 15,000 products | ✅ All data loaded |
| **Combined approach** | 15 | 3s | 15,000 products | ✅ All data, optimized |

---

## Best Practices

### 1. Always Assume Data Will Grow
```javascript
// ❌ BAD - Assumes < 1000 rows
const { data } = await supabase.from('table').select('*');

// ✅ GOOD - Handles any size
const data = await loadAllRows('table');
```

### 2. Filter Before Loading
```javascript
// ❌ BAD - Load all, filter in JS
const all = await loadAll();
const filtered = all.filter(x => x.status === 'active');

// ✅ GOOD - Filter in database
const filtered = await supabase
    .from('table')
    .select('*')
    .eq('status', 'active');
```

### 3. Use Appropriate Batch Sizes
- **Case IDs in `.in()`**: 500 (safe limit)
- **Rows in `.range()`**: 1000 (maximum efficiency)
- **Adjust based on row size**: Smaller batches for large rows

### 4. Add Loading Indicators
```javascript
console.log(`Loading batch ${batchNum}...`);
// User sees progress, not frozen page
```

### 5. Consider Caching
```javascript
// Cache results to avoid re-loading
if (cache.has('products')) {
    return cache.get('products');
}
const products = await loadAllProducts();
cache.set('products', products);
```

---

## Common Pitfalls

### ❌ Pitfall 1: Forgetting to Check Length
```javascript
// Infinite loop if you don't check length!
while (hasMore) {
    const { data } = await supabase.from('table').range(offset, offset + 999);
    allRows.push(...data);
    offset += 1000;
    // Missing: hasMore = data.length === 1000;
}
```

### ❌ Pitfall 2: Using `.limit()` Instead of `.range()`
```javascript
// ❌ BAD - .limit() doesn't help with pagination
const { data } = await supabase.from('table').select('*').limit(5000);
// Still returns max 1000 rows!

// ✅ GOOD - Use .range()
const { data } = await supabase.from('table').select('*').range(0, 4999);
```

### ❌ Pitfall 3: Not Handling Errors
```javascript
// ❌ BAD - No error handling
const { data } = await supabase.from('table').select('*');

// ✅ GOOD - Handle errors
const { data, error } = await supabase.from('table').select('*');
if (error) {
    console.error('Query failed:', error);
    return [];
}
```

---

## Summary

### Key Takeaways
1. **Supabase has a 1000-row default limit** - Always paginate
2. **Use `.range()` for pagination** - Most reliable method
3. **Filter in database, not JavaScript** - Faster and safer
4. **Batch `.in()` filters** - Limit is ~1000 items
5. **Combine techniques for robustness** - Handle any scale

### Quick Reference
```javascript
// Load all rows with pagination
async function loadAll(table, filters = {}) {
    const all = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase.from(table).select('*');
        
        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
        });
        
        const { data } = await query.range(offset, offset + 999);
        
        if (data && data.length > 0) {
            all.push(...data);
            offset += 1000;
            hasMore = data.length === 1000;
        } else {
            hasMore = false;
        }
    }

    return all;
}
```

**Use this pattern everywhere you load data from Supabase!**

