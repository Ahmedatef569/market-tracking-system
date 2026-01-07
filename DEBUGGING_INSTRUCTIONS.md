# Debugging Instructions for Case Products Issue

## Problem
Nouran El-Gohary's case (CASE-20260106-MK31DPWQ) has products in the database but they're not showing in the frontend.

## Database Verification ✅
The database has the correct data:
- Case ID: `37037bc9-4ed3-4a2a-911d-48efa2b771dd`
- Product 1: Embosphere (Merit, Company product, 1 unit)
- Product 2: Radio Focus (Terumo, Competitor product, 1 unit)

## Frontend Testing

### Option 1: Use Debug Page
1. Open `debug_case_products.html` in your browser
2. Open browser console (F12)
3. Click "Test Nouran's Case"
4. Check what appears on the page and in the console

### Option 2: Test on Employee Page
1. Login as Nouran El-Gohary on `employee.html`
2. Open browser console (F12)
3. Paste this code and press Enter:

```javascript
console.log('=== DEBUGGING CASE PRODUCTS ===');
console.log('Total cases loaded:', state.cases.length);
console.log('Total case products loaded:', state.caseProducts.length);
console.log('Case products map size:', state.caseProductsByCase.size);

// Find Nouran's specific case
const nouranCase = state.cases.find(c => c.case_code === 'CASE-20260106-MK31DPWQ');
console.log('Nouran case found:', nouranCase);

if (nouranCase) {
    const products = state.caseProductsByCase.get(nouranCase.id);
    console.log('Products for this case:', products);
}

// Check if products exist for this case_id
const caseId = '37037bc9-4ed3-4a2a-911d-48efa2b771dd';
const productsForCase = state.caseProducts.filter(p => p.case_id === caseId);
console.log('Products with case_id ' + caseId + ':', productsForCase);
```

### Option 3: Direct Supabase Query
On any page with Supabase loaded, paste this in console:

```javascript
import { supabase } from './js/supabaseClient.js';

const { data, error } = await supabase
    .from('case_products')
    .select('*')
    .eq('case_id', '37037bc9-4ed3-4a2a-911d-48efa2b771dd');

console.log('Direct query result:', data);
console.log('Error:', error);
```

## What to Look For

1. **If case_products array is empty**: The Supabase query is failing
2. **If case_products has data but caseProductsByCase is empty**: The grouping function is failing
3. **If both have data but UI doesn't show it**: The rendering logic has a bug
4. **If you see CORS errors**: Network/API configuration issue
5. **If you see "permission denied"**: RLS policy issue (but we verified RLS is disabled)

## Next Steps Based on Results

- **No data loaded**: Check network tab for failed requests
- **Data loaded but not displayed**: Check filtering logic in `getFilteredCases()`
- **Console errors**: Share the exact error message

