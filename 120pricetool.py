import os
import sys
import requests
import json
import http.cookiejar as cookielib
import sqlite3 as sl


def write_to_database(data_list):
    # 建立資料庫連線
    conn = sl.connect("120price_database.db")  # 替換為您的資料庫名稱

    # 建立資料表 (如果尚未存在)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product TEXT,
                product_flavor TEXT,
                product_price INTEGER
            )
        """)

    # 檢查記錄是否已存在，如果不存在，再將資料寫入資料庫
    with conn:
        for data in data_list:
            product, product_flavor, product_price = data
            cursor = conn.execute("""
                SELECT id FROM products WHERE product = ? AND product_flavor = ? AND product_price = ?
            """, (product, product_flavor, product_price))
            if not cursor.fetchone():
                conn.execute("""
                    INSERT INTO products (product, product_flavor, product_price) VALUES (?, ?, ?)
                """, (product, product_flavor, product_price))

def get_unique_products():
    # 建立資料庫連線
    conn = sl.connect("120price_database.db")
    cursor = conn.cursor()

    cursor.execute("""
        SELECT product, MIN(product_price) FROM products GROUP BY product ORDER BY MIN(product_price)
    """)
    # 找出每個商品的最低價格並按價格排序
    products = cursor.fetchall()

    conn.close()
    return products

def find_combinations(budget, unique_products, exact_match=True, max_price=None):
    conn = sl.connect("120price_database.db")
    cursor = conn.cursor()

    combinations = []
    # 將unique_products轉換為字典，方便後續檢查價格
    unique_products_dict = {product: price for product, price in unique_products}

    def find_combination(current_combination, current_budget, start_idx):
        if current_budget == 0:
            combinations.append(current_combination)
            return

        for i in range(start_idx, len(unique_products)):
            product, price = unique_products[i]
            if price > current_budget:
                continue
            if i > start_idx and price == unique_products[i - 1][1]:
                continue

            next_combination = current_combination + [(product, price)]
            next_budget = current_budget - price
            find_combination(next_combination, next_budget, i + 1)

    find_combination([], budget, 0)

    formatted_combinations = []
    for idx, combination in enumerate(combinations, start=1):
        total_price = sum(price for _, price in combination)
        if exact_match:
            if total_price == budget:
                formatted_combinations.append((idx, combination))
        else:
            if not max_price or total_price <= max_price:
                formatted_combinations.append((idx, combination))

    conn.close()

    return formatted_combinations

def find_combinations_in_range(min_budget, max_budget, unique_products):
    conn = sl.connect("120price_database.db")
    cursor = conn.cursor()

    combinations = []
    for idx, (product, price) in enumerate(unique_products, start=1):
        if min_budget <= price <= max_budget:  # 確認價格在範圍內
            remaining_budget = max_budget - price

            if remaining_budget >= 0:
                combinations.append((idx, product, price))

    conn.close()

    return combinations

def get_data():

    # # 建立Session並關聯LWPCookieJar
    # _session = requests.session()
    # _session.cookies = cookielib.LWPCookieJar(filename="cookies.txt")

    # # 用GET請求來觸發網站設置Cookie
    # url = "http://dinbendon.net/do/"  # 請將此處替換為您想要訪問的網頁URL
    # response = _session.get(url)

    # # 將Cookie儲存到檔案中
    # _session.cookies.save(ignore_discard=True, ignore_expires=True)

    # # 在後續的請求中使用相同的Cookie
    # response = _session.get("http://dinbendon.net/do/")

    # cookie_data = []
    # # 輸出完整的Cookie
    # for cookie in _session.cookies:
    #     print(f"{cookie.name}: {cookie.value}")
    #     cookie_data.append(cookie.value)


    # header_cookie = {'Cookie':'signIn.rememberMe=true; INDIVIDUAL_KEY=85ccebb4-77a7-4b48-89c9-852bef3c5588; MergeOrderItemShowComment=true; MergeOrderItemExpand=true; signInPanel__signInForm__username=fenglin66; signInPanel__signInForm__password=lzkE1XqlTno%3D; JSESSIONID='+ cookie_data[1] +'; DBD-XSRF='+ cookie_data[0]}
    header_cookie = {'Cookie':'signIn.rememberMe=true; INDIVIDUAL_KEY=85ccebb4-77a7-4b48-89c9-852bef3c5588; MergeOrderItemShowComment=true; MergeOrderItemExpand=true; signInPanel__signInForm__username=fenglin66; signInPanel__signInForm__password=lzkE1XqlTno%3D; JSESSIONID=C0A63B76200D53E77C607E3A62AD5633; DBD-XSRF=NvEvpbwWHZkPq'}
    # params
    orderHashId = []

    url = "https://dinbendon.net/mvc/api/order/progress"

    payload = {}
    headers = header_cookie
    print(headers)
    response = requests.request("GET", url, headers=headers, data=payload)
    json_data = json.loads(response.text)


    for i in range(len(json_data["data"])):
        if json_data["data"][i]["shopName"][0:3] == "下午茶":
            orderHashId.append(json_data["data"][i]["orderHashId"])

    # print(orderHashId)


    product_data = []  # 儲存每筆資料的暫存列表
    for j in orderHashId:
        url = f"https://dinbendon.net/mvc/api/order/{j}/add-item"

        payload = {}
        headers = header_cookie

        response = requests.request("GET", url, headers=headers, data=payload)
        json_data = json.loads(response.text)

        product = None
        product_flavor = []
        product_price = []

        # 資料處理
        for product_count in range(len(json_data["data"]["shop"]["categories"])):
            for product_item_count in range(len(json_data["data"]["shop"]["categories"][product_count]["products"])):
                product = json_data["data"]["shop"]["categories"][product_count]["products"][product_item_count]["name"]
                for product_price_count in range(len(json_data["data"]["shop"]["categories"][product_count]["products"][product_item_count]["variations"])):
                    product_flavor = json_data["data"]["shop"]["categories"][product_count]["products"][product_item_count]["variations"][product_price_count]["name"]
                    product_price = json_data["data"]["shop"]["categories"][product_count]["products"][product_item_count]["variations"][product_price_count]["price"]
                    product_data.append((product, product_flavor, product_price))  # 將每筆資料加入暫存列表

    # 在資料處理完成後，一次性寫入資料庫
    write_to_database(product_data)

def main():
    get_data()  # 更新商品資料庫（如果需要的話）

    budget = 125
    unique_products = get_unique_products()  # 從資料庫取得Price的大小排序
    print(unique_products)
    # 假設設定範圍為 120 到 100
    min_budget = 125
    max_budget = 125
    
    start_idx = 0
    end_idx = 0

    for i in range(max_budget,min_budget,-1):
        # 尋找budget 的商品組合
        exact_match_combinations = find_combinations(i, unique_products, exact_match=True)

        if i == max_budget:
            print(f"剛好等於 {budget} 元的組合：")
            for idx, combination in exact_match_combinations:
                print(f"{idx}. ", end="")
                for product, price in combination:
                    print(f"{product} (${price})", end="  ")
                print()
            print(f"\n在 {min_budget} 到 {max_budget} 元範圍內的組合(不包含120元)：")
        else:
            for idx, combination in exact_match_combinations:
                start_idx = end_idx + idx
                print(f"{start_idx}. ", end="")
                for product, price in combination:
                    print(f"{product} (${price})", end="  ")
                print()         
            end_idx = start_idx
 
if __name__ == "__main__":
    main()
