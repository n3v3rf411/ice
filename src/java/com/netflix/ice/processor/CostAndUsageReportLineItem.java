package com.netflix.ice.processor;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.common.collect.Maps;
import com.netflix.ice.common.LineItem;

public class CostAndUsageReportLineItem extends LineItem {
    protected Logger logger = LoggerFactory.getLogger(getClass());

    private final int resourceTagStartIndex;
	private final String[] resourceTagsHeader;
	private int purchaseOptionIndex;
	private int lineItemTypeIndex;
	private int lineItemNormalizationFactorIndex;
	private int productNormalizationSizeFactorIndex;
	private int productUsageTypeIndex;
	
	private static Map<String, Double> normalizationFactors = Maps.newHashMap();
	
	{
		normalizationFactors.put("nano", 0.25);
		normalizationFactors.put("micro", 0.5);
		normalizationFactors.put("small", 1.0);
		normalizationFactors.put("medium", 2.0);
		normalizationFactors.put("large", 4.0);
		normalizationFactors.put("xlarge", 8.0);
	}
	    	
    public CostAndUsageReportLineItem(boolean useBlended, CostAndUsageReport report) {        	
        accountIdIndex = report.getColumnIndex("lineItem", "UsageAccountId");
        productIndex = report.getColumnIndex("product", "ProductName");
        zoneIndex = report.getColumnIndex("lineItem", "AvailabilityZone");
        descriptionIndex = report.getColumnIndex("lineItem", "LineItemDescription");
        usageTypeIndex = report.getColumnIndex("lineItem", "UsageType");
        operationIndex = report.getColumnIndex("lineItem", "Operation");
        usageQuantityIndex = report.getColumnIndex("lineItem", "UsageAmount");
        startTimeIndex = report.getColumnIndex("lineItem", "UsageStartDate");
        endTimeIndex = report.getColumnIndex("lineItem", "UsageEndDate");
        rateIndex = report.getColumnIndex("lineItem", useBlended ? "BlendedRate" : "UnblendedRate");
        costIndex = report.getColumnIndex("lineItem", useBlended ? "BlendedCost" : "UnblendedCost");
        resourceIndex = report.getColumnIndex("lineItem", "ResourceId");
        reservedIndex = report.getColumnIndex("pricing", "term");
        
        resourceTagStartIndex = report.getCategoryStartIndex("resourceTags");
        report.getCategoryEndIndex("resourceTags");           
        resourceTagsHeader = report.getCategoryHeader("resourceTags");
        
        purchaseOptionIndex = report.getColumnIndex("pricing", "PurchaseOption");
        lineItemTypeIndex = report.getColumnIndex("lineItem", "LineItemType");
        lineItemNormalizationFactorIndex = report.getColumnIndex("lineItem", "NormalizationFactor");
        productNormalizationSizeFactorIndex = report.getColumnIndex("product", "normalizationSizeFactor"); // First appeared in 07-2017
        productUsageTypeIndex = report.getColumnIndex("product",  "usagetype");
    }
    
    public int size() {
    	return resourceTagStartIndex + resourceTagsHeader.length;
    }

    @Override
    public long getStartMillis() {
        return amazonBillingDateFormatISO.parseMillis(items[startTimeIndex]);
    }

    @Override
    public long getEndMillis() {
        return amazonBillingDateFormatISO.parseMillis(items[endTimeIndex]);
    }
    
    @Override
    public String getUsageType() {
    	String purchaseOption = getPurchaseOption();
    	String lineItemType = getLineItemType();
    	if ((lineItemType.equals("RIFee") || lineItemType.equals("DiscountedUsage")) && (purchaseOption.isEmpty() || !purchaseOption.equals("All Upfront")))
    		return items[productUsageTypeIndex];
    	return items[usageTypeIndex];
    }
    
    @Override
    public String[] getResourceTagsHeader() {
    	return resourceTagsHeader;
    }

    @Override
    public int getResourceTagsSize() {
    	if (items.length - resourceTagStartIndex <= 0)
    		return 0;
    	return items.length - resourceTagStartIndex;
    }

    @Override
    public String getResourceTag(int index) {
    	if (items.length <= resourceTagStartIndex + index)
    		return "";
    	return items[resourceTagStartIndex + index];
    }

    @Override
    public String getResourceTagsString() {
    	StringBuilder sb = new StringBuilder();
    	boolean first = true;
    	for (int i = 0; i < resourceTagsHeader.length && i+resourceTagStartIndex < items.length; i++) {
    		if (items[i+resourceTagStartIndex].isEmpty()) {
    			continue;
    		}
    		sb.append((first ? "" : "|") + resourceTagsHeader[i].substring("user:".length()) + "=" + items[i+resourceTagStartIndex]);
    		first = false;
    	}
    	return sb.toString();
    }
    
    @Override
    public boolean isReserved() {
    	if (reservedIndex > items.length) {
    		logger.error("Line item record too short. Reserved index = " + reservedIndex + ", record length = " + items.length);
    		return false;
    	}
    	return items[reservedIndex].equals("Reserved") || items[usageTypeIndex].contains("HeavyUsage");
    }

	@Override
	public String getPurchaseOption() {
		return items[purchaseOptionIndex];
	}

	public String getLineItemType() {
		return items[lineItemTypeIndex];
	}
	
	private double computeProductNormalizedSizeFactor(String usageType) {
		String[] usageParts = usageType.split("\\.");
		if (usageParts.length < 2)
			return 1.0;
		String size = usageParts[1];
		
		if (size.endsWith("xlarge") && size.length() > "xlarge".length())
			return Double.parseDouble(size.substring(0, size.lastIndexOf("xlarge"))) * 8;
		
		Double factor = normalizationFactors.get(size);
		return factor == null ? 1.0 : factor;
	}
	
	@Override
	public String getUsageQuantity() {
    	String purchaseOption = getPurchaseOption();
    	if (purchaseOption.isEmpty() || purchaseOption.equals("All Upfront"))
    		return super.getUsageQuantity();

    	if (items[lineItemTypeIndex].equals("DiscountedUsage")) {
			double usageAmount = Double.parseDouble(items[usageQuantityIndex]);
			double normFactor = items[lineItemNormalizationFactorIndex].isEmpty() ? computeProductNormalizedSizeFactor(items[usageTypeIndex]) : Double.parseDouble(items[lineItemNormalizationFactorIndex]);
			double productFactor = items[productNormalizationSizeFactorIndex].isEmpty() ? computeProductNormalizedSizeFactor(items[productUsageTypeIndex]) : Double.parseDouble(items[productNormalizationSizeFactorIndex]);
			Double actualUsage = usageAmount * normFactor / productFactor;
			return actualUsage.toString();
		}
		return super.getUsageQuantity();
	}

	public int getResourceTagStartIndex() {
		return resourceTagStartIndex;
	}

	public int getPurchaseOptionIndex() {
		return purchaseOptionIndex;
	}

	public int getLineItemTypeIndex() {
		return lineItemTypeIndex;
	}

	public int getLineItemNormalizationFactorIndex() {
		return lineItemNormalizationFactorIndex;
	}

	public int getProductNormalizationSizeFactorIndex() {
		return productNormalizationSizeFactorIndex;
	}

	public int getProductUsageTypeIndex() {
		return productUsageTypeIndex;
	}
}
