#!/usr/bin/env python3
"""
Backend API Test Suite for KASIR TOKO BAGUS
Focus: Verify non-destructive backup/import functionality after deployment fix
"""
import requests
import sys
import uuid
from datetime import datetime

class BackendTester:
    def __init__(self, base_url="https://repo-preview-live-7.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.initial_product_count = 0
        self.initial_transaction_count = 0
        self.test_results = []

    def log_result(self, test_name, passed, message=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            status = "✅ PASSED"
        else:
            status = "❌ FAILED"
        
        result = f"{status} - {test_name}"
        if message:
            result += f": {message}"
        
        print(result)
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message
        })
        return passed

    def test_get_products(self):
        """Test GET /api/products - should return ~978 products"""
        print("\n🔍 Testing GET /api/products...")
        try:
            response = requests.get(f"{self.base_url}/products", timeout=10)
            
            if response.status_code != 200:
                return self.log_result(
                    "GET /api/products",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
            
            products = response.json()
            if not isinstance(products, list):
                return self.log_result(
                    "GET /api/products",
                    False,
                    "Response is not a list"
                )
            
            self.initial_product_count = len(products)
            
            # Verify we have approximately 978 products (allow some variance)
            if self.initial_product_count < 900:
                return self.log_result(
                    "GET /api/products",
                    False,
                    f"Expected ~978 products, got {self.initial_product_count}"
                )
            
            return self.log_result(
                "GET /api/products",
                True,
                f"Retrieved {self.initial_product_count} products"
            )
            
        except Exception as e:
            return self.log_result("GET /api/products", False, str(e))

    def test_get_transactions(self):
        """Test GET /api/transactions - should return transactions"""
        print("\n🔍 Testing GET /api/transactions...")
        try:
            response = requests.get(f"{self.base_url}/transactions", timeout=10)
            
            if response.status_code != 200:
                return self.log_result(
                    "GET /api/transactions",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
            
            transactions = response.json()
            if not isinstance(transactions, list):
                return self.log_result(
                    "GET /api/transactions",
                    False,
                    "Response is not a list"
                )
            
            self.initial_transaction_count = len(transactions)
            
            return self.log_result(
                "GET /api/transactions",
                True,
                f"Retrieved {self.initial_transaction_count} transactions"
            )
            
        except Exception as e:
            return self.log_result("GET /api/transactions", False, str(e))

    def test_get_settings(self):
        """Test GET /api/settings - should return 200"""
        print("\n🔍 Testing GET /api/settings...")
        try:
            response = requests.get(f"{self.base_url}/settings", timeout=10)
            
            if response.status_code != 200:
                return self.log_result(
                    "GET /api/settings",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
            
            settings = response.json()
            if not isinstance(settings, dict):
                return self.log_result(
                    "GET /api/settings",
                    False,
                    "Response is not a dict"
                )
            
            return self.log_result(
                "GET /api/settings",
                True,
                f"Settings retrieved: shopName={settings.get('shopName', 'N/A')}"
            )
            
        except Exception as e:
            return self.log_result("GET /api/settings", False, str(e))

    def test_get_reports_summary(self):
        """Test GET /api/reports/summary - should return 200 with report data"""
        print("\n🔍 Testing GET /api/reports/summary...")
        try:
            response = requests.get(f"{self.base_url}/reports/summary", timeout=10)
            
            if response.status_code != 200:
                return self.log_result(
                    "GET /api/reports/summary",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
            
            report = response.json()
            if not isinstance(report, dict):
                return self.log_result(
                    "GET /api/reports/summary",
                    False,
                    "Response is not a dict"
                )
            
            if "total_transaksi" not in report or "total_omzet" not in report:
                return self.log_result(
                    "GET /api/reports/summary",
                    False,
                    "Missing required fields (total_transaksi, total_omzet)"
                )
            
            return self.log_result(
                "GET /api/reports/summary",
                True,
                f"Report: {report['total_transaksi']} transactions, Rp{report['total_omzet']:,.0f}"
            )
            
        except Exception as e:
            return self.log_result("GET /api/reports/summary", False, str(e))

    def test_backup_import_new_items(self):
        """
        CRITICAL TEST: POST /api/backup/import with NEW unique IDs
        Must be NON-DESTRUCTIVE - existing 978 products must remain
        """
        print("\n🔍 Testing POST /api/backup/import (NEW items - non-destructive)...")
        try:
            # Create backup payload with NEW unique IDs
            new_product_id_1 = f"test-product-{uuid.uuid4()}"
            new_product_id_2 = f"test-product-{uuid.uuid4()}"
            new_transaction_id = f"test-tx-{uuid.uuid4()}"
            
            backup_payload = {
                "app": "kasir-warung",
                "version": 1,
                "products": [
                    {
                        "id": new_product_id_1,
                        "name": "Test Product 1 - Non-Destructive",
                        "category": "Test",
                        "unit": "pcs",
                        "buy_price": 5000,
                        "sell_price": 7000,
                        "stock": 10,
                        "tiers": [],
                        "variations": [],
                        "created_at": datetime.utcnow().isoformat(),
                        "updated_at": datetime.utcnow().isoformat()
                    },
                    {
                        "id": new_product_id_2,
                        "name": "Test Product 2 - Non-Destructive",
                        "category": "Test",
                        "unit": "pcs",
                        "buy_price": 3000,
                        "sell_price": 5000,
                        "stock": 20,
                        "tiers": [],
                        "variations": [],
                        "created_at": datetime.utcnow().isoformat(),
                        "updated_at": datetime.utcnow().isoformat()
                    }
                ],
                "transactions": [
                    {
                        "id": new_transaction_id,
                        "items": [
                            {
                                "product_id": new_product_id_1,
                                "name": "Test Product 1",
                                "price": 7000,
                                "quantity": 2,
                                "subtotal": 14000
                            }
                        ],
                        "total": 14000,
                        "discount": 0,
                        "cash_paid": 15000,
                        "change": 1000,
                        "created_at": datetime.utcnow().isoformat()
                    }
                ]
            }
            
            response = requests.post(
                f"{self.base_url}/backup/import",
                json=backup_payload,
                timeout=30
            )
            
            if response.status_code != 200:
                return self.log_result(
                    "POST /api/backup/import (new items)",
                    False,
                    f"Expected 200, got {response.status_code}: {response.text[:200]}"
                )
            
            result = response.json()
            if not result.get("ok"):
                return self.log_result(
                    "POST /api/backup/import (new items)",
                    False,
                    f"Response ok=False: {result}"
                )
            
            # CRITICAL: Verify product count increased (non-destructive)
            response = requests.get(f"{self.base_url}/products", timeout=10)
            current_products = response.json()
            current_count = len(current_products)
            
            if current_count < self.initial_product_count:
                return self.log_result(
                    "POST /api/backup/import (new items)",
                    False,
                    f"DATA LOSS! Count decreased from {self.initial_product_count} to {current_count}"
                )
            
            if current_count < self.initial_product_count + 2:
                return self.log_result(
                    "POST /api/backup/import (new items)",
                    False,
                    f"New items not added. Expected >= {self.initial_product_count + 2}, got {current_count}"
                )
            
            return self.log_result(
                "POST /api/backup/import (new items)",
                True,
                f"Non-destructive verified: {self.initial_product_count} → {current_count} products (added {current_count - self.initial_product_count})"
            )
            
        except Exception as e:
            return self.log_result("POST /api/backup/import (new items)", False, str(e))

    def test_backup_import_upsert_existing(self):
        """
        CRITICAL TEST: POST /api/backup/import with EXISTING product ID
        Must UPDATE in place (upsert), not duplicate
        """
        print("\n🔍 Testing POST /api/backup/import (UPSERT existing item)...")
        try:
            # First, get an existing product
            response = requests.get(f"{self.base_url}/products?limit=1", timeout=10)
            products = response.json()
            
            if not products or len(products) == 0:
                return self.log_result(
                    "POST /api/backup/import (upsert)",
                    False,
                    "No products available to test upsert"
                )
            
            existing_product = products[0]
            existing_id = existing_product["id"]
            original_sell_price = existing_product.get("sell_price", 0)
            
            # Get current product count
            response = requests.get(f"{self.base_url}/products", timeout=10)
            count_before_upsert = len(response.json())
            
            # Create backup with SAME ID but CHANGED sell_price
            new_sell_price = original_sell_price + 1000
            
            backup_payload = {
                "app": "kasir-warung",
                "version": 1,
                "products": [
                    {
                        "id": existing_id,
                        "name": existing_product.get("name", "Test"),
                        "category": existing_product.get("category", ""),
                        "unit": existing_product.get("unit", "pcs"),
                        "buy_price": existing_product.get("buy_price", 0),
                        "sell_price": new_sell_price,  # CHANGED
                        "stock": existing_product.get("stock", 0),
                        "tiers": existing_product.get("tiers", []),
                        "variations": existing_product.get("variations", []),
                        "created_at": existing_product.get("created_at", datetime.utcnow().isoformat()),
                        "updated_at": datetime.utcnow().isoformat()
                    }
                ],
                "transactions": []
            }
            
            response = requests.post(
                f"{self.base_url}/backup/import",
                json=backup_payload,
                timeout=30
            )
            
            if response.status_code != 200:
                return self.log_result(
                    "POST /api/backup/import (upsert)",
                    False,
                    f"Expected 200, got {response.status_code}"
                )
            
            # Verify product count did NOT increase (upsert, not insert)
            response = requests.get(f"{self.base_url}/products", timeout=10)
            count_after_upsert = len(response.json())
            
            if count_after_upsert != count_before_upsert:
                return self.log_result(
                    "POST /api/backup/import (upsert)",
                    False,
                    f"Product duplicated! Count changed from {count_before_upsert} to {count_after_upsert}"
                )
            
            # Verify the product was updated (sell_price changed)
            all_products = response.json()
            updated_product = next((p for p in all_products if p["id"] == existing_id), None)
            
            if not updated_product:
                return self.log_result(
                    "POST /api/backup/import (upsert)",
                    False,
                    f"Product {existing_id} not found after upsert"
                )
            
            if updated_product.get("sell_price") != new_sell_price:
                return self.log_result(
                    "POST /api/backup/import (upsert)",
                    False,
                    f"Product not updated. Expected sell_price={new_sell_price}, got {updated_product.get('sell_price')}"
                )
            
            return self.log_result(
                "POST /api/backup/import (upsert)",
                True,
                f"Upsert verified: product {existing_id[:8]}... updated (price {original_sell_price} → {new_sell_price}), count unchanged ({count_before_upsert})"
            )
            
        except Exception as e:
            return self.log_result("POST /api/backup/import (upsert)", False, str(e))

    def test_backup_import_invalid_payload(self):
        """
        Test POST /api/backup/import with invalid payload
        Must return 400 and NOT change existing data
        """
        print("\n🔍 Testing POST /api/backup/import (invalid payload)...")
        try:
            # Get current product count
            response = requests.get(f"{self.base_url}/products", timeout=10)
            count_before = len(response.json())
            
            # Test 1: Empty products list
            print("  → Testing empty products list...")
            response = requests.post(
                f"{self.base_url}/backup/import",
                json={"products": [], "transactions": []},
                timeout=30
            )
            
            if response.status_code != 400:
                return self.log_result(
                    "POST /api/backup/import (invalid - empty)",
                    False,
                    f"Expected 400 for empty products, got {response.status_code}"
                )
            
            # Verify data unchanged
            response = requests.get(f"{self.base_url}/products", timeout=10)
            count_after_empty = len(response.json())
            
            if count_after_empty != count_before:
                return self.log_result(
                    "POST /api/backup/import (invalid - empty)",
                    False,
                    f"Data changed after invalid request! {count_before} → {count_after_empty}"
                )
            
            # Test 2: Products not a list
            print("  → Testing products not a list...")
            response = requests.post(
                f"{self.base_url}/backup/import",
                json={"products": "not a list", "transactions": []},
                timeout=30
            )
            
            if response.status_code != 400:
                return self.log_result(
                    "POST /api/backup/import (invalid - not list)",
                    False,
                    f"Expected 400 for invalid products type, got {response.status_code}"
                )
            
            # Verify data unchanged
            response = requests.get(f"{self.base_url}/products", timeout=10)
            count_after_invalid = len(response.json())
            
            if count_after_invalid != count_before:
                return self.log_result(
                    "POST /api/backup/import (invalid - not list)",
                    False,
                    f"Data changed after invalid request! {count_before} → {count_after_invalid}"
                )
            
            return self.log_result(
                "POST /api/backup/import (invalid payload)",
                True,
                f"Invalid payloads rejected with 400, data unchanged (count={count_before})"
            )
            
        except Exception as e:
            return self.log_result("POST /api/backup/import (invalid payload)", False, str(e))

    def test_final_data_integrity(self):
        """
        Final verification: Ensure no data loss after all import tests
        Product count should be >= initial count
        """
        print("\n🔍 Final data integrity check...")
        try:
            response = requests.get(f"{self.base_url}/products", timeout=10)
            final_count = len(response.json())
            
            if final_count < self.initial_product_count:
                return self.log_result(
                    "Final data integrity",
                    False,
                    f"DATA LOSS DETECTED! Initial: {self.initial_product_count}, Final: {final_count}"
                )
            
            return self.log_result(
                "Final data integrity",
                True,
                f"No data loss: {self.initial_product_count} → {final_count} products"
            )
            
        except Exception as e:
            return self.log_result("Final data integrity", False, str(e))

    def run_all_tests(self):
        """Run all backend tests"""
        print("=" * 70)
        print("BACKEND API TEST SUITE - KASIR TOKO BAGUS")
        print("Focus: Non-destructive backup/import verification")
        print("=" * 70)
        
        # Basic endpoint tests
        self.test_get_products()
        self.test_get_transactions()
        self.test_get_settings()
        self.test_get_reports_summary()
        
        # Critical backup/import tests
        self.test_backup_import_new_items()
        self.test_backup_import_upsert_existing()
        self.test_backup_import_invalid_payload()
        
        # Final verification
        self.test_final_data_integrity()
        
        # Print summary
        print("\n" + "=" * 70)
        print(f"📊 TEST SUMMARY: {self.tests_passed}/{self.tests_run} tests passed")
        print("=" * 70)
        
        if self.tests_passed == self.tests_run:
            print("✅ ALL TESTS PASSED - Non-destructive backup/import verified!")
            return 0
        else:
            print(f"❌ {self.tests_run - self.tests_passed} test(s) failed")
            return 1

def main():
    tester = BackendTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
