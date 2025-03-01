import OpenAIService from "../../services/ContentCreationService.js";

export const createContent = async (data) => {
  console.log(data.customersSay);
  const content = await OpenAIService.generateContent(
    data.title,
    data.description,
    data.customersSay,
    "amazon"
  );
  const parseData = JSON.parse(content);
  parseData.content = parseData.content
    .replace("_affiliateLink_", data.link)
    .replace(/\n/g, " ");

  return parseData;
};
