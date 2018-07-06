/*
 *
 *  Copyright 2013 Netflix, Inc.
 *
 *     Licensed under the Apache License, Version 2.0 (the "License");
 *     you may not use this file except in compliance with the License.
 *     You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *     Unless required by applicable law or agreed to in writing, software
 *     distributed under the License is distributed on an "AS IS" BASIS,
 *     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *     See the License for the specific language governing permissions and
 *     limitations under the License.
 *
 */
package com.netflix.ice.tag;

import java.util.concurrent.ConcurrentMap;

import com.google.common.collect.Maps;

public class Product extends Tag {
	private static final long serialVersionUID = 2L;
	
	/*
	 * Product is a Tag representing AWS products. The name field
	 * stored in the inherited Tag class is used for both the
	 * map key in the ProductService and the product names returned
	 * by the DataManager which are ultimately displayed in the
	 * browser UI.
	 * 
	 * By default the name is the canonical name for the product which
	 * is the Amazon/AWS name pulled from the billing
	 * reports with the AWS or Amazon prefix removed. For some products
	 * we break down the usage into sub-categories as defined below.
	 *
	 * The product's names can also be overridden to use the
	 * common acronym such as EC2 for Elastic Compute Cloud and
	 * S3 for Simple Storage Service.
	 */
	
	/*
	 * fileName is used for naming product-specific files
	 */
	private final String fileName;
	
	/*
	 * Standard product name strings needed to test identity in the "is" methods.
	 */
	public static final String apiGateway   = "API Gateway";
	public static final String cloudFront   = "CloudFront";
	public static final String cloudhsm     = "CloudHSM";
    public static final String cloudWatch   = "CloudWatch";
	public static final String dataTransfer = "Data Transfer";
	public static final String ec2          = "Elastic Compute Cloud";
	public static final String rds          = "RDS Service";
	public static final String rdsFull      = "Relational Database Service"; // AWS started using the full name on 2017-09-01
	public static final String redshift     = "Redshift";
	public static final String s3           = "Simple Storage Service";
	public static final String monitor      = "Monitor"; // seems to refer to EC2 metrics, but I've never seen this in any reports -jimroth
    /*
     * ICE-defined product sub-category strings used to test identity in the "is" methods.
     */
    public static final String ebs           = "Elastic Block Storage";
    public static final String ec2Instance   = "EC2 Instance";
    public static final String eip           = "Elastic IP";
    public static final String rdsInstance   = "RDS Instance";

	/*
	 * Maps for holding overridden product names. One map for each lookup direction.
	 */
    private static ConcurrentMap<String, String> overrideNames = Maps.newConcurrentMap();
    private static ConcurrentMap<String, String> canonicalNames = Maps.newConcurrentMap();

    /*
     * Product constructor should only be called by the ProductService.
     * All references to products needs to be through the product service maps.
     * 
     * Product can be constructed using either the AWS name or the alternate name.
     * The inherited tag name value will use the alternate name if present, otherwise
     * it uses the canonical AWS name (AWS and Amazon stripped off the head).
     * 
     * The Canonical name is always used by the TagGroup serializer so that changing
     * the override name won't corrupt the data files.
     */
    public Product(String name) {  
    	super(getOverride(canonicalName(name)));
   	
    	// substitute "_" for spaces and make lower case
    	// This operation must be invertible, so we assume product
    	// names don't use underscore!
    	fileName = getCanonicalName(this.name).replace(" ", "__");
    }

    private static String canonicalName(String name) {
    	String s = name;
    	// Strip off "Amazon" or "AWS"
    	if (s.startsWith("Amazon"))
    		s = s.substring("Amazon".length()).trim();
    	else if (s.startsWith("AWS"))
    		s = s.substring("AWS".length()).trim();
    	return s;
    }
    
    public static String getNameFromFileName(String fileName) {
    	// Invert the operation we did to create the short name
    	return fileName.replace("__", " ");
    }
    
    public static void addOverride(String canonical, String override) {
    	overrideNames.put(canonical,  override);
    	canonicalNames.put(override,  canonical);
    }

    /*
     * getOverride() will return the override name corresponding the supplied
     * canonical name if the canonical name has been overridden. If not
     * overridden, then it just returns the canoncial name supplied.
     */
    protected static String getOverride(String canonicalName) {
    	String n;
    	return (n = overrideNames.get(canonicalName)) != null ? n : canonicalName;
    }
    
    /*
     * getCanonicalName() will return the canonical name for the provide name.
     * If there is no override for the supplied name it just returns the
     * supplied name.
     */
    protected static String getCanonicalName(String name) {
    	String n;
    	return (n = canonicalNames.get(name)) != null ? n : name;
    }
    
    public String getCanonicalName() {
    	String n;
    	return (n = canonicalNames.get(name)) != null ? n : name;
    }

    public String getFileName() {
    	return fileName;
    }
    
    public boolean isSupport() {
    	return getCanonicalName().contains("Support");
    }
    
    public boolean isApiGateway() {
    	return name.equals(getOverride(apiGateway));
    }
    
    public boolean isCloudFront() {
    	return name.equals(getOverride(cloudFront));
    }
    
    public boolean isCloudHsm() {
    	return name.equals(getOverride(cloudhsm));
    }
    
    public boolean isDataTransfer() {
    	return name.equals(getOverride(dataTransfer));
    }
    
    public boolean isEc2() {
    	return name.equals(getOverride(ec2));
    }
    
    public boolean isRds() {
    	return name.equals(getOverride(rds)) || name.equals(getOverride(rdsFull));
    }
    
    public boolean isRedshift() {
    	return name.equals(getOverride(redshift));
    }
    
    public boolean isS3() {
    	return name.equals(getOverride(s3));
    }
    
    public boolean isMonitor() {
    	return name.equals(getOverride(monitor));
    }
    
    public boolean isEbs() {
    	return name.equals(getOverride(ebs));
    }
    
    public boolean isCloudWatch() {
    	return name.equals(getOverride(cloudWatch));
    }
    
    public boolean isEc2Instance() {
    	return name.equals(getOverride(ec2Instance));
    }
    
    public boolean isEip() {
    	return name.equals(getOverride(eip));
    }
    
    public boolean isRdsInstance() {
    	return name.equals(getOverride(rdsInstance));
    }
    
}
