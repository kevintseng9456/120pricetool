async function write_to_database(data_list) {
  const existingData = sessionStorage.getItem("products");
  const existingProducts = existingData ? JSON.parse(existingData) : [];

  for (const data of data_list) {
    const [product, product_flavor, product_price] = data;
    const isDataExist = existingProducts.some(
      (p) => p.product === product && p.product_flavor === product_flavor && p.product_price === product_price
    );

    if (!isDataExist) {
      existingProducts.push({ product, product_flavor, product_price });
    }
  }

  sessionStorage.setItem("products", JSON.stringify(existingProducts));
}

function get_unique_products() {
  const existingData = sessionStorage.getItem("products");
  const existingProducts = existingData ? JSON.parse(existingData) : [];

  const uniqueProducts = existingProducts.reduce((acc, curr) => {
    const existingProduct = acc.find((p) => p.product === curr.product);
    if (!existingProduct) {
      acc.push({ product: curr.product, product_price: curr.product_price });
    }
    return acc;
  }, []);

  return uniqueProducts.sort((a, b) => a.product_price - b.product_price);
}

function find_combinations(budget, unique_products, exact_match = true, max_price = null) {
  const combinations = [];
  const unique_products_dict = unique_products.reduce((acc, curr) => {
    acc[curr.product] = curr.product_price;
    return acc;
  }, {});

  // 在 find_combination 函式中修改組合商品的邏輯
  function find_combination(current_combination, current_budget, start_idx) {
    if (current_budget === 0) {
      combinations.push(current_combination);
      return;
    }

    for (let i = start_idx; i < unique_products.length; i++) {
      const { product, product_price } = unique_products[i];
      if (product_price > current_budget) {
        continue;
      }

      const next_combination = [...current_combination, { product, price: product_price }];
      const next_budget = current_budget - product_price;
      find_combination(next_combination, next_budget, i); // 注意此處不需要 i + 1
    }
  }

  find_combination([], budget, 0);

  const formatted_combinations = [];
  for (let idx = 0; idx < combinations.length; idx++) {
    const combination = combinations[idx];
    const total_price = combination.reduce((acc, curr) => acc + curr.price, 0);
    if (exact_match) {
      if (total_price === budget) {
        formatted_combinations.push({ idx: idx + 1, combination });
      }
    } else {
      if (!max_price || total_price <= max_price) {
        formatted_combinations.push({ idx: idx + 1, combination });
      }
    }
  }

  return formatted_combinations;
}

async function get_data(get_cookie) {
  const header_cookie = {'Cookie':get_cookie};
  const orderHashId = [];
  const progressUrl = 'https://dinbendon.net/mvc/api/order/progress';
  const headers = {
    Cookie: header_cookie,
  };

  try {
    // Fetch order progress data
    const progressResponse = await fetch(progressUrl, {
      method: 'GET',
      headers,
      mode: 'no-cors', // 設定為 'no-cors'，以禁用 CORS
    });
    if (!progressResponse.ok) {
      throw new Error(`Network response was not ok: ${progressResponse.status} ${progressResponse.statusText}`);
    }
    const progressJsonData = await progressResponse.json();

    // 取得篩選日期的值
    const datePicker = document.getElementById("datePicker");
    const selectedDate = new Date(datePicker.value);

    // 設定預設日期為每週五
    selectedDate.setDate(selectedDate.getDate() + (5 - selectedDate.getDay() + 7) % 7);

    // 取得篩選日期的月份和日期，並轉換為 "M/D" 格式
    const selectedDateString = `${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`;
    console.log(selectedDateString);

    // Regular expression pattern to match shop names starting with '下午茶' followed by the selectedDateString
    const shopNamePattern = new RegExp(`^下午茶${selectedDateString}`);

    for (const data of progressJsonData.data) {
      if (shopNamePattern.test(data.shopName)) {
        console.log(`下午茶${selectedDateString}`);
        orderHashId.push(data.orderHashId);
      }
    }

    const product_data = []; // Temporarily store each data record

    // Fetch product data for each orderHashId
    for (const j of orderHashId) {
      const itemUrl = `https://dinbendon.net/mvc/api/order/${j}/add-item`;

      const itemResponse = await fetch(itemUrl, {
        method: 'GET',
        headers,
      });
      const itemJsonData = await itemResponse.json();

      // Process the data
      for (const category of itemJsonData.data.shop.categories) {
        for (const product of category.products) {
          const productName = product.name;
          for (const variation of product.variations) {
            const productFlavor = variation.name;
            const productPrice = variation.price;
            product_data.push([productName, productFlavor, productPrice]);
          }
        }
      }
    }

    // Store the data in sessionStorage
    sessionStorage.setItem('product_data', JSON.stringify(product_data));

    // Call the function to write the data to the database
    write_to_database(product_data);

  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

// let budget = 120;
// 設定最小預算和最大預算
let min_budget = 100;
let max_budget = 120;

async function main(get_cookie,min_budget,max_budget) {
  await get_data(get_cookie); // 更新 sessionStorage 中的 product data (如果需要)

  const unique_products = get_unique_products(); // 從 sessionStorage 中取得按價格排序的 products
  console.log(`unique_products ${unique_products}`);
  let start_idx = 0;
  let end_idx = 0;

  const combinationsToShow = [];

  for (let i = max_budget; i >= min_budget; i--) {
    // 找出每個預算下的商品組合
    const exact_match_combinations = find_combinations(i, unique_products, true);

    if (i === max_budget) {
      combinationsToShow.push({ budget: i, combinations: exact_match_combinations });
    } else {
      exact_match_combinations.forEach(({ idx, combination }) => {
        start_idx = end_idx + idx;
        combinationsToShow.push({ budget: i, combinations: [{ idx: start_idx, combination }] });
      });
      end_idx = start_idx;
    }
  }

  // 將結果顯示在popup.html的id="result"元素中
  const resultElement = document.getElementById("result");
  resultElement.innerHTML = ""; // 清空原有的結果
  const raw_budget = combinationsToShow[0]["budget"];
  for (const { budget, combinations } of combinationsToShow) {
    for (const { idx, combination } of combinations) {
      if (idx === 1){
        const budgetHeader = document.createElement("h3");
        if (budget === raw_budget -1){
          budgetHeader.textContent = `預算小於 ${raw_budget} NT$:`;
        }else{
          budgetHeader.textContent = `預算 ${budget} NT$:`;
        }
        resultElement.appendChild(budgetHeader);
      }

      const listItem = document.createElement("li");
      listItem.textContent = `${idx}. ${combination
        .map(({ product, price }) => `${product} ($${price})`)
        .join("  ")}`;
      resultElement.appendChild(listItem);
    }
  }
}


document.addEventListener("DOMContentLoaded", () => {
  // Load the get_cookie value from localStorage (if available) and set it in the input field
  const getCookieInput = document.getElementById("get_cookie");
  const storedCookieValue = localStorage.getItem("get_cookie");
  if (storedCookieValue) {
    getCookieInput.value = storedCookieValue;
  }
  const submitButton = document.getElementById("submitButton");
  submitButton.addEventListener("click", async () => {
    // 取得使用者輸入的預算、最小預算和最大預算
    // const budget = parseInt(document.getElementById("budget").value);
    const minBudget = parseInt(document.getElementById("minBudget").value);
    const maxBudget = parseInt(document.getElementById("maxBudget").value);
    const getCookieValue = getCookieInput.value;;
    // 將使用者輸入的get_cookie值存儲到localStorage
    localStorage.setItem("get_cookie", getCookieValue);

    if (!getCookieValue) {
      alert("請輸入 get_cookie 的值！");
      return; // 如果 get_cookie 沒有輸入值，則不執行後續的動作
    }
    console.log(minBudget,maxBudget);
    main(getCookieValue,minBudget,maxBudget);
  });
});





