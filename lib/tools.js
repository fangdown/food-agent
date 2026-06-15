const MEAL_BASE_URL = "https://www.themealdb.com/api/json/v1/1";
const COCKTAIL_BASE_URL = "https://www.thecocktaildb.com/api/json/v1/1";

export const toolDefinitions = [
  {
    type: "function",
    name: "search_meals",
    description: "按关键词、食材、分类或地区搜索菜谱。适合用户想找某种菜、某种食材、某地区菜系或晚餐推荐。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "搜索词，例如 chicken、pasta、beef、Italian"
        },
        mode: {
          type: "string",
          enum: ["name", "ingredient", "category", "area", "random"],
          description: "搜索模式：name 按名称，ingredient 按食材，category 按分类，area 按地区，random 随机推荐"
        },
        limit: {
          type: "number",
          description: "返回数量，默认 5"
        }
      },
      required: ["query", "mode"]
    }
  },
  {
    type: "function",
    name: "get_meal_detail",
    description: "按菜谱 ID 获取详细信息，包括食材清单、用量、烹饪步骤、图片、分类和地区。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: {
          type: "string",
          description: "TheMealDB 的 idMeal"
        }
      },
      required: ["id"]
    }
  },
  {
    type: "function",
    name: "search_cocktails",
    description: "按名称、食材或随机搜索饮品/鸡尾酒。适合给菜谱搭配饮品。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "搜索词，例如 margarita、gin、lemon"
        },
        mode: {
          type: "string",
          enum: ["name", "ingredient", "random"],
          description: "搜索模式：name 按名称，ingredient 按食材，random 随机推荐"
        },
        limit: {
          type: "number",
          description: "返回数量，默认 3"
        }
      },
      required: ["query", "mode"]
    }
  }
];

function createToolResult(summary, data, nextActions = [], status = "success") {
  return {
    status,
    summary,
    next_actions: nextActions,
    artifacts: [],
    data
  };
}

function getIngredients(item, prefix) {
  return Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;
    const name = item[`${prefix}Ingredient${number}`]?.trim();
    const measure = item[`${prefix}Measure${number}`]?.trim();
    if (!name) return null;

    return {
      name,
      measure: measure || ""
    };
  }).filter(Boolean);
}

function getInstructionSummary(text = "") {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function normalizeMealSummary(meal) {
  return {
    type: "meal",
    id: meal.idMeal,
    title: meal.strMeal,
    image: meal.strMealThumb,
    category: meal.strCategory || "",
    area: meal.strArea || meal.strCountry || "",
    ingredients: [],
    instructions: "",
    source: "TheMealDB"
  };
}

function normalizeMealDetail(meal) {
  return {
    ...normalizeMealSummary(meal),
    ingredients: getIngredients(meal, "str"),
    instructions: meal.strInstructions || "",
    instructionSummary: getInstructionSummary(meal.strInstructions),
    youtube: meal.strYoutube || "",
    source: "TheMealDB"
  };
}

function normalizeCocktailSummary(drink) {
  return {
    type: "cocktail",
    id: drink.idDrink,
    title: drink.strDrink,
    image: drink.strDrinkThumb,
    category: drink.strCategory || "",
    glass: drink.strGlass || "",
    alcoholic: drink.strAlcoholic || "",
    ingredients: [],
    instructions: "",
    source: "TheCocktailDB"
  };
}

function normalizeCocktailDetail(drink) {
  return {
    ...normalizeCocktailSummary(drink),
    ingredients: getIngredients(drink, "str"),
    instructions: drink.strInstructions || "",
    instructionSummary: getInstructionSummary(drink.strInstructions),
    source: "TheCocktailDB"
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`公开 API 请求失败：${response.status}`);
  }

  return response.json();
}

function limitItems(items, limit, max) {
  const count = Math.min(Number(limit) || max, max);
  return items.slice(0, count);
}

async function getMealDetailById(id) {
  const data = await fetchJson(`${MEAL_BASE_URL}/lookup.php?i=${encodeURIComponent(id)}`);
  return data.meals?.[0] ? normalizeMealDetail(data.meals[0]) : null;
}

async function getCocktailDetailById(id) {
  const data = await fetchJson(`${COCKTAIL_BASE_URL}/lookup.php?i=${encodeURIComponent(id)}`);
  return data.drinks?.[0] ? normalizeCocktailDetail(data.drinks[0]) : null;
}

export const toolHandlers = {
  search_meals: async ({ query, mode = "name", limit = 5 }) => {
    let url = `${MEAL_BASE_URL}/search.php?s=${encodeURIComponent(query)}`;

    if (mode === "ingredient") url = `${MEAL_BASE_URL}/filter.php?i=${encodeURIComponent(query)}`;
    if (mode === "category") url = `${MEAL_BASE_URL}/filter.php?c=${encodeURIComponent(query)}`;
    if (mode === "area") url = `${MEAL_BASE_URL}/filter.php?a=${encodeURIComponent(query)}`;
    if (mode === "random") url = `${MEAL_BASE_URL}/random.php`;

    const data = await fetchJson(url);
    const rawMeals = limitItems(data.meals || [], limit, 6);
    const meals =
      mode === "name" || mode === "random"
        ? rawMeals.map(normalizeMealDetail)
        : rawMeals.map(normalizeMealSummary);

    if (meals.length === 0) {
      return createToolResult(`没有找到 ${query} 相关菜谱`, { meals: [], cards: [] }, [
        "换一个英文关键词，例如 chicken、beef、pasta",
        "尝试按食材或地区搜索"
      ], "warning");
    }

    return createToolResult(`找到 ${meals.length} 个菜谱`, {
      query,
      mode,
      meals,
      cards: meals
    });
  },

  get_meal_detail: async ({ id }) => {
    const meal = await getMealDetailById(id);

    if (!meal) {
      return createToolResult(`没有找到 ID 为 ${id} 的菜谱`, { meal: null, cards: [] }, [
        "先调用 search_meals 获取有效 idMeal"
      ], "warning");
    }

    return createToolResult(`已获取菜谱详情：${meal.title}`, {
      meal,
      cards: [meal]
    });
  },

  search_cocktails: async ({ query, mode = "name", limit = 3 }) => {
    let url = `${COCKTAIL_BASE_URL}/search.php?s=${encodeURIComponent(query)}`;

    if (mode === "ingredient") url = `${COCKTAIL_BASE_URL}/filter.php?i=${encodeURIComponent(query)}`;
    if (mode === "random") url = `${COCKTAIL_BASE_URL}/random.php`;

    const data = await fetchJson(url);
    const rawDrinks = limitItems(data.drinks || [], limit, 4);
    const drinks =
      mode === "name" || mode === "random"
        ? rawDrinks.map(normalizeCocktailDetail)
        : await Promise.all(
            rawDrinks.map(async (drink) => {
              const detail = await getCocktailDetailById(drink.idDrink);
              return detail || normalizeCocktailSummary(drink);
            })
          );

    if (drinks.length === 0) {
      return createToolResult(`没有找到 ${query} 相关饮品`, { drinks: [], cards: [] }, [
        "换一个英文关键词，例如 margarita、gin、lemon"
      ], "warning");
    }

    return createToolResult(`找到 ${drinks.length} 个饮品`, {
      query,
      mode,
      drinks,
      cards: drinks
    });
  }
};
