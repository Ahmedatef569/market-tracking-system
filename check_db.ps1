# PowerShell script to check Supabase database
$apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92cWp3cHF0cm5lempqbHJ5YnprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3NDQ1ODUsImV4cCI6MjA3NTMyMDU4NX0.gMVg2wakMto7rnEUH6SGG0z3KqmAVXiK4HEVkLlf1HM"
$baseUrl = "https://ovqjwpqtrnezjjlrybzk.supabase.co/rest/v1"

$headers = @{
    "apikey" = $apiKey
    "Authorization" = "Bearer $apiKey"
}

Write-Host "`n=== RECENT CASES ===" -ForegroundColor Cyan
$cases = Invoke-RestMethod -Uri "$baseUrl/cases?select=id,case_code,created_at,total_company_units,total_competitor_units&order=created_at.desc&limit=5" -Headers $headers -Method Get
$cases | Format-Table -AutoSize

Write-Host "`n=== CASE PRODUCTS FOR RECENT CASES ===" -ForegroundColor Cyan
$caseIds = $cases.id -join ","
$products = Invoke-RestMethod -Uri "$baseUrl/case_products?select=case_id,product_name,company_name,units,is_company_product&case_id=in.($caseIds)" -Headers $headers -Method Get
if ($products.Count -eq 0) {
    Write-Host "NO PRODUCTS FOUND FOR RECENT CASES!" -ForegroundColor Red
} else {
    $products | Format-Table -AutoSize
}

Write-Host "`n=== PRODUCT COUNT PER CASE ===" -ForegroundColor Cyan
foreach ($case in $cases) {
    $caseProducts = $products | Where-Object { $_.case_id -eq $case.id }
    $count = if ($caseProducts) { $caseProducts.Count } else { 0 }
    Write-Host "Case: $($case.case_code) - Products: $count - Units: $($case.total_company_units + $case.total_competitor_units)" -ForegroundColor $(if ($count -eq 0) { "Red" } else { "Green" })
}

