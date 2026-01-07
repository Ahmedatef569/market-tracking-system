# 📊 BULK UPLOAD GUIDE - Admin Mass Upload Feature

## ✅ IMPLEMENTATION COMPLETE

This guide explains the comprehensive bulk upload feature for Products, Doctors, and Accounts in the Medical Device Tracking System.

---

## 🎯 OVERVIEW

The Admin user can now mass upload:
1. **Products** - With Company, Category, Sub Category, and Line
2. **Doctors** - With up to 5 Product Specialists and their Lines
3. **Accounts** - With up to 3 Product Specialists, Account Type, and Location

Each upload type has:
- ✅ **Template Download Button** - Get exact Excel format with examples
- ✅ **Comprehensive Validation** - Clear error messages for missing/invalid data
- ✅ **Auto-creation** - Automatically creates Lines and Companies if they don't exist
- ✅ **Multi-specialist Support** - Assign multiple Product Specialists to Doctors/Accounts
- ✅ **Detailed Feedback** - Shows success count and first 3 errors if any fail

---

## 📦 1. PRODUCTS BULK UPLOAD

### Required Fields:
- **Product Name** - Name of the medical device product
- **Category** - Product category (e.g., Catheters, Wires, Stents)
- **Company** - Manufacturer/supplier name
- **Line** - Product line (e.g., Vascular, Cardiac, Neuro)

### Optional Fields:
- **Sub Category** - More specific product classification

### Excel Template Columns:
```
| Product Name | Category | Sub Category | Company | Line |
|--------------|----------|--------------|---------|------|
| Example Product 1 | Catheters | Diagnostic | Medtronic | Vascular |
| Example Product 2 | Wires | | Boston Scientific | Cardiac |
```

### How It Works:
1. Click **"Download Template"** button to get Excel file with examples
2. Fill in your products (delete example rows)
3. Click **"Choose File"** and select your Excel file
4. Click **"Upload"** button
5. System will:
   - ✅ Validate all required fields
   - ✅ Auto-create Company if it doesn't exist
   - ✅ Auto-create Line if it doesn't exist
   - ✅ Detect if Company is marked as "Company Product" automatically
   - ✅ Insert all valid products
   - ✅ Show detailed results

### Validation Rules:
- ❌ Product Name cannot be empty
- ❌ Category cannot be empty
- ❌ Company cannot be empty
- ❌ Line cannot be empty
- ⚠️ Duplicate products (same name + company + line) will be rejected by database

---

## 👨‍⚕️ 2. DOCTORS BULK UPLOAD

### Required Fields:
- **Doctor Name** - Full name of the doctor
- **Product Specialist Name** - Full name of primary Product Specialist (must exist in system)
- **Line** - Primary line assignment

### Optional Fields:
- **Product Specialist 2 Name** - Second Product Specialist
- **PS 2 Line** - Line for second Product Specialist
- **Product Specialist 3 Name** - Third Product Specialist
- **PS 3 Line** - Line for third Product Specialist
- **Product Specialist 4 Name** - Fourth Product Specialist
- **PS 4 Line** - Line for fourth Product Specialist
- **Product Specialist 5 Name** - Fifth Product Specialist
- **PS 5 Line** - Line for fifth Product Specialist
- **Specialty** - Doctor's medical specialty (e.g., Cardiology, Neurology)
- **Phone** - Contact phone number
- **Email Address** - Doctor's email address

### Excel Template Columns:
```
| Doctor Name | Product Specialist Name | Line | Product Specialist 2 Name | PS 2 Line | ... | Specialty | Phone | Email Address |
|-------------|------------------------|------|---------------------------|-----------|-----|-----------|-------|---------------|
| Dr. John Smith | Ahmed Ali | Vascular | | | | Cardiology | 01234567890 | doctor@hospital.com |
```

### How It Works:
1. Click **"Download Template"** button to get Excel file with examples
2. Fill in your doctors (delete example rows)
3. **IMPORTANT**: Product Specialist names must match EXACTLY with employee names in the system
4. Click **"Choose File"** and select your Excel file
5. Click **"Upload"** button
6. System will:
   - ✅ Validate all required fields
   - ✅ Find Product Specialists by full name (case-insensitive)
   - ✅ Auto-create Lines if they don't exist
   - ✅ Assign up to 5 Product Specialists with their Lines
   - ✅ Set status to "Approved" automatically (no approval needed)
   - ✅ Insert all valid doctors
   - ✅ Show detailed results

### Validation Rules:
- ❌ Doctor Name cannot be empty
- ❌ Product Specialist Name cannot be empty (must exist in system)
- ❌ Line cannot be empty
- ⚠️ If Product Specialist not found, row will be skipped with error message
- ⚠️ Duplicate doctor names will be rejected by database
- ℹ️ If PS 2-5 names provided but not found, they will be silently skipped (not an error)

---

## 🏥 3. ACCOUNTS BULK UPLOAD

### Required Fields:
- **Account Name** - Name of the hospital/clinic/account
- **Product Specialist Name** - Full name of primary Product Specialist (must exist in system)
- **Line** - Primary line assignment
- **Account Type** - Must be one of: **Private**, **UPA**, or **Military**

### Optional Fields:
- **Product Specialist 2 Name** - Second Product Specialist
- **PS 2 Line** - Line for second Product Specialist
- **Product Specialist 3 Name** - Third Product Specialist
- **PS 3 Line** - Line for third Product Specialist
- **Address** - Physical address of the account
- **Governorate** - Egyptian governorate (e.g., Cairo, Alexandria, Giza)

### Excel Template Columns:
```
| Account Name | Product Specialist Name | Line | Account Type | Product Specialist 2 Name | PS 2 Line | ... | Address | Governorate |
|--------------|------------------------|------|--------------|---------------------------|-----------|-----|---------|-------------|
| Cairo Hospital | Ahmed Ali | Vascular | Private | | | | 123 Main Street | Cairo |
```

### How It Works:
1. Click **"Download Template"** button to get Excel file with examples
2. Fill in your accounts (delete example rows)
3. **IMPORTANT**: 
   - Product Specialist names must match EXACTLY with employee names in the system
   - Account Type must be exactly: **Private**, **UPA**, or **Military** (case-sensitive)
4. Click **"Choose File"** and select your Excel file
5. Click **"Upload"** button
6. System will:
   - ✅ Validate all required fields
   - ✅ Validate Account Type against allowed values
   - ✅ Find Product Specialists by full name (case-insensitive)
   - ✅ Auto-create Lines if they don't exist
   - ✅ Assign up to 3 Product Specialists with their Lines
   - ✅ Set status to "Approved" automatically (no approval needed)
   - ✅ Insert all valid accounts
   - ✅ Show detailed results

### Validation Rules:
- ❌ Account Name cannot be empty
- ❌ Product Specialist Name cannot be empty (must exist in system)
- ❌ Line cannot be empty
- ❌ Account Type cannot be empty
- ❌ Account Type must be one of: Private, UPA, Military (exact spelling)
- ⚠️ If Product Specialist not found, row will be skipped with error message
- ⚠️ Duplicate account names will be rejected by database
- ℹ️ If PS 2-3 names provided but not found, they will be silently skipped (not an error)

---

## 🎓 BEST PRACTICES

### Before Uploading:
1. ✅ **Download the template** - Always start with the template to ensure correct column names
2. ✅ **Check Product Specialist names** - Go to Admin → Employees section and copy exact names
3. ✅ **Use consistent naming** - Keep Line names consistent (e.g., always "Vascular" not "vascular" or "Vascular Line")
4. ✅ **Validate Account Types** - Only use: Private, UPA, or Military
5. ✅ **Remove example rows** - Delete the example data before adding your own

### During Upload:
1. ✅ **Start small** - Test with 2-3 rows first before uploading hundreds
2. ✅ **Check error messages** - If rows are skipped, read the error messages carefully
3. ✅ **Fix and re-upload** - You can fix failed rows and upload them again

### After Upload:
1. ✅ **Verify data** - Check the tables to ensure data was imported correctly
2. ✅ **Check filters** - Filters should automatically update with new Lines/Categories
3. ✅ **Export to verify** - Use Export button to download and verify imported data

---

## ⚠️ COMMON ERRORS & SOLUTIONS

### Error: "Product Specialist not found: John Doe"
**Solution**: The employee name doesn't exist in the system or spelling is wrong.
- Go to Admin → Employees section
- Find the correct employee name
- Copy it EXACTLY (including spaces and capitalization)
- Update your Excel file

### Error: "Invalid account type: private"
**Solution**: Account Type is case-sensitive.
- Change "private" to "Private"
- Change "upa" to "UPA"
- Change "military" to "Military"

### Error: "Missing required fields"
**Solution**: One or more required columns are empty.
- Check that all required fields have values
- For Products: Product Name, Category, Company, Line
- For Doctors: Doctor Name, Product Specialist Name, Line
- For Accounts: Account Name, Product Specialist Name, Line, Account Type

### Error: "Duplicate key value violates unique constraint"
**Solution**: The record already exists in the database.
- For Products: Same Product Name + Company + Line combination exists
- For Doctors: Doctor with same name already exists
- For Accounts: Account with same name already exists
- Either skip this row or update the existing record manually

---

## 📋 FIELD REQUIREMENTS SUMMARY

### Database Schema vs Frontend Requirements:

| Table | Field | Database | Frontend Required | Notes |
|-------|-------|----------|-------------------|-------|
| **Products** | name | REQUIRED | ✅ REQUIRED | Product name |
| | category | REQUIRED | ✅ REQUIRED | Category |
| | sub_category | Optional | ⚪ Optional | Sub category |
| | company_id | Optional | ✅ REQUIRED | Must provide Company name |
| | line_id | Optional | ✅ REQUIRED | Must provide Line name |
| **Doctors** | name | REQUIRED | ✅ REQUIRED | Doctor name |
| | owner_employee_id | REQUIRED | ✅ REQUIRED | Must provide PS name |
| | line_id | Optional | ✅ REQUIRED | Must provide Line name |
| | specialty | Optional | ⚪ Optional | Recommended |
| | phone | Optional | ⚪ Optional | Recommended |
| | email_address | Optional | ⚪ Optional | Recommended |
| **Accounts** | name | REQUIRED | ✅ REQUIRED | Account name |
| | account_type | REQUIRED | ✅ REQUIRED | Private/UPA/Military |
| | owner_employee_id | REQUIRED | ✅ REQUIRED | Must provide PS name |
| | line_id | Optional | ✅ REQUIRED | Must provide Line name |
| | address | Optional | ⚪ Optional | Recommended |
| | governorate | Optional | ⚪ Optional | Recommended |

**Key Insight**: While the database allows some fields to be NULL, the frontend requires them for complete and functional data entry. This ensures data quality and system usability.

---

## 🚀 QUICK START GUIDE

### For Products:
1. Admin → Products section
2. Click "Download Template" button
3. Fill Excel with: Product Name, Category, Company, Line (+ optional Sub Category)
4. Click "Choose File" → Select your Excel
5. Click "Upload"
6. ✅ Done!

### For Doctors:
1. Admin → Doctors section
2. Click "Download Template" button
3. Fill Excel with: Doctor Name, Product Specialist Name, Line (+ optional PS 2-5, Specialty, Phone, Email)
4. **Important**: Copy Product Specialist names exactly from Employees section
5. Click "Choose File" → Select your Excel
6. Click "Upload"
7. ✅ Done!

### For Accounts:
1. Admin → Accounts section
2. Click "Download Template" button
3. Fill Excel with: Account Name, Product Specialist Name, Line, Account Type (+ optional PS 2-3, Address, Governorate)
4. **Important**: Copy Product Specialist names exactly from Employees section
5. **Important**: Account Type must be: Private, UPA, or Military
6. Click "Choose File" → Select your Excel
7. Click "Upload"
8. ✅ Done!

---

## 📞 SUPPORT

If you encounter issues:
1. Check this guide for common errors
2. Verify your Excel file matches the template format
3. Test with 1-2 rows first
4. Read error messages carefully - they tell you exactly what's wrong

---

**Last Updated**: 2025-10-27
**Version**: 1.0
**Status**: ✅ Production Ready

