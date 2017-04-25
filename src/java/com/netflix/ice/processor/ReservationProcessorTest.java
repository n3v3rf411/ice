package com.netflix.ice.processor;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.ivy.util.StringUtils;
import org.junit.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.common.collect.Lists;
import com.google.common.collect.Maps;
import com.netflix.ice.basic.BasicAccountService;
import com.netflix.ice.basic.BasicReservationService;
import com.netflix.ice.common.AccountService;
import com.netflix.ice.common.TagGroup;
import com.netflix.ice.processor.Ec2InstanceReservationPrice.ReservationPeriod;
import com.netflix.ice.tag.Account;
import com.netflix.ice.tag.Operation;
import com.netflix.ice.tag.Product;
import com.netflix.ice.tag.Region;
import com.netflix.ice.tag.UsageType;
import com.netflix.ice.tag.Zone;

public class ReservationProcessorTest {
    protected Logger logger = LoggerFactory.getLogger(getClass());

    // reservationAccounts is a cross-linked list of accounts where each account
	// can borrow reservations from any other.
	private static Map<Account, List<Account>> reservationAccounts = Maps.newHashMap();
	
	private static final int numAccounts = 3;
	private static final List<Account> accounts = Lists.newArrayList();
	static {
		// Auto-populate the reservationAccounts map based on numAccounts
		for (Integer i = 1; i <= numAccounts; i++) {
			// Create accounts of the form Account("111111111111", "Account1")
			accounts.add(new Account(StringUtils.repeat(i.toString(), 12), "Account" + i.toString()));
		}
		// Populate the reservationAccounts
		for (int i = 0; i < numAccounts; i++) {
            List<Account> borrowers = Lists.newArrayList();
	    	for (int j = 0; j < numAccounts; j++) {
	    		if (i == j)
	    			continue;
	    		
	    		borrowers.add(accounts.get(j));	    		
	    	}
	    	reservationAccounts.put(accounts.get(i), borrowers);
		}
		
		
	}

	@Test
	public void testConstructor() {
		assertEquals("Number of accounts should be " + numAccounts, numAccounts, accounts.size());
		ReservationProcessor rp = new ReservationProcessor(reservationAccounts);
		assertNotNull("Contructor returned null", rp);
	}
	
	public static class Datum {
		public TagGroup tagGroup;
		public double value;
		
		public Datum(TagGroup tagGroup, double value)
		{
			this.tagGroup = tagGroup;
			this.value = value;
		}
		
		public Datum(Account account, Region region, Zone zone, Operation operation, String usageType, double value)
		{
			this.tagGroup = new TagGroup(account, region, zone, Product.ec2_instance, operation, UsageType.getUsageType(usageType, "hours"), null);
			this.value = value;
		}
	}
	
	private Map<TagGroup, Double> makeDataMap(Datum[] data) {
		Map<TagGroup, Double> m = Maps.newHashMap();
		for (Datum d: data) {
			m.put(d.tagGroup, d.value);
		}
		return m;
	}
	
	private void runOneHourTest(long startMillis, String[] reservationsCSV, Datum[] usageData, Datum[] costData, Datum[] expectedUsage, Datum[] expectedCost, String debugFamily) {
		Map<TagGroup, Double> hourUsageData = makeDataMap(usageData);
		Map<TagGroup, Double> hourCostData = makeDataMap(costData);

		List<Map<TagGroup, Double>> ud = new ArrayList<Map<TagGroup, Double>>();
		ud.add(hourUsageData);
		ReadWriteData usage = new ReadWriteData();
		usage.setData(ud, 0, false);
		List<Map<TagGroup, Double>> cd = new ArrayList<Map<TagGroup, Double>>();
		cd.add(hourCostData);
		ReadWriteData cost = new ReadWriteData();
		cost.setData(cd, 0, false);

		runTest(startMillis, reservationsCSV, usage, cost, debugFamily);

		assertTrue("usage size should be " + expectedUsage.length + ", got " + hourUsageData.size(), hourUsageData.size() == expectedUsage.length);
		for (Datum datum: expectedUsage) {
			assertNotNull("should have usage tag group " + datum.tagGroup, hourUsageData.get(datum.tagGroup));	
			assertTrue("should have usage value " + datum.value + " for tag " + datum.tagGroup + ", got " + hourUsageData.get(datum.tagGroup), hourUsageData.get(datum.tagGroup) == datum.value);
		}
		assertTrue("cost size should be " + expectedCost.length + ", got " + hourCostData.size(), hourCostData.size() == expectedCost.length);
		for (Datum datum: expectedCost) {
			assertNotNull("should have cost tag group " + datum.tagGroup, hourCostData.get(datum.tagGroup));	
			assertEquals("should have cost value for tag " + datum.tagGroup, datum.value, hourCostData.get(datum.tagGroup), 0.001);
		}
	}
	
	private void runTest(long startMillis, String[] reservationsCSV, ReadWriteData usage, ReadWriteData cost, String debugFamily) {
		Map<String, CanonicalReservedInstances> reservations = Maps.newHashMap();
		for (String res: reservationsCSV) {
			String[] fields = res.split(",");
			reservations.put(fields[0]+","+fields[2]+","+fields[3], new CanonicalReservedInstances(res));
		}
		
		AccountService accountService = new BasicAccountService(accounts, reservationAccounts, null, null, null);
		
		BasicReservationService reservationService = new BasicReservationService(ReservationPeriod.oneyear, Ec2InstanceReservationPrice.ReservationUtilization.FIXED);
		reservationService.updateReservations(reservations, accountService, startMillis);		

		ReservationProcessor rp = new ReservationProcessor(reservationAccounts);
		rp.setDebugHour(0);
		rp.setDebugFamily(debugFamily);
		rp.process(Ec2InstanceReservationPrice.ReservationUtilization.HEAVY, reservationService, usage, cost, startMillis);
		rp.process(Ec2InstanceReservationPrice.ReservationUtilization.HEAVY_PARTIAL, reservationService, usage, cost, startMillis);
		rp.process(Ec2InstanceReservationPrice.ReservationUtilization.FIXED, reservationService, usage, cost, startMillis);		
	}
	
	/*
	 * Test one AZ scoped full-upfront reservation that's used by the owner.
	 */
	@Test
	public void testUsedFixedAZ() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.large", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.large", 0.095),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test one AZ scoped full-upfront reservation that isn't used.
	 */
	@Test
	public void testUnusedFixedAZ() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,14,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.unusedInstancesFixed, "m1.large", 14.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.unusedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.large", 1.3345),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test two AZ scoped reservations - one HEAVY and one FIXED that are both used by the owner account.
	 */
	@Test
	public void testTwoUsedHeavyFixedAZ() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
			"111111111111,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,0.0,1,Linux/UNIX (Amazon VPC),active,USD,No Upfront,Hourly:0.112",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.large", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesHeavy, "m1.large", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesHeavy, "m1.large", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
				new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesHeavy, "m1.large", 0.112),
				new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.large", 0.095),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}


	/*
	 * Test two equivalent AZ scoped full-upfront reservation that are both used by the owner account.
	 */
	@Test
	public void testTwoUsedSameFixedAZ() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
			"111111111111,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.large", 2.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 2.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.large", 0.190),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test one AZ scoped full-upfront reservations where one instance is used by the owner account and one borrowed by a second account. Three instances are unused.
	 */
	@Test
	public void testFixedAZ() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.small,Availability Zone,us-east-1a,false,1464699998099,1496235997000,31536000,0.0,206.0,5,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.unusedInstancesFixed, "m1.small", 3.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.lentInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.small", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.lentInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.unusedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.small", 0.1176),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.small", 0.0),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test one Region scoped full-upfront reservation where one instance is used by the owner account in each of several AZs.
	 */
	@Test
	public void testFixedRegionalMultiAZ() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.small,Region,,false,1464699998099,1496235997000,31536000,0.0,206.0,5,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
				new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
				new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1B, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
				new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1C, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1B, Operation.reservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1C, Operation.reservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.unusedInstancesFixed, "m1.small", 2.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1B, Operation.reservedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1C, Operation.reservedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.unusedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.small", 0.1176),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}
	
	/*
	 * Test two full-upfront reservations - one AZ, one Region that are both used by the owner account.
	 */
	@Test
	public void testTwoUsedOneAZOneRegion() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
			"111111111111,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Region,,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.large", 2.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 2.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.large", 0.095),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.large", 0.095),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test two full-upfront reservations - one AZ, one Region that are both used by a borrowing account.
	 */
	@Test
	public void testTwoUsedOneAZOneRegionBorrowed() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Availability Zone,us-east-1a,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
			"111111111111,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.large,Region,,false,1464702209129,1496238208000,31536000,0.0,835.0,1,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
				new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.large", 1.0),
				new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1B, Operation.bonusReservedInstancesFixed, "m1.large", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.lentInstancesFixed, "m1.large", 1.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.large", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.large", 1.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1B, Operation.borrowedInstancesFixed, "m1.large", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.lentInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.upfrontAmortizedFixed, "m1.large", 0.095),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.large", 0.095),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1B, Operation.borrowedInstancesFixed, "m1.large", 0.0),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test one Region scoped full-upfront reservation where one instance is used by the owner account and one borrowed by a second account.
	 */
	@Test
	public void testFixedRegionalFamily() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.small,Region,,false,1464699998099,1496235997000,31536000,0.0,206.0,4,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.large", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.familyReservedInstancesFixed, "m1.large", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.familyReservedInstancesFixed, "m1.large", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.small", 0.094),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test one Region scoped full-upfront reservation where one instance is used by the owner account and one borrowed by a second account.
	 */
	@Test
	public void testFixedRegional() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
			"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.small,Region,,false,1464699998099,1496235997000,31536000,0.0,206.0,5,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.small", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.unusedInstancesFixed, "m1.small", 3.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.small", 1.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.small", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, Zone.US_EAST_1A, Operation.reservedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.small", 0.1176),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.unusedInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.small", 0.0),
			new Datum(accounts.get(1), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.small", 0.0),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}

	/*
	 * Test two Region scoped full-upfront reservations where one instance from each is family borrowed by a third account.
	 */
	@Test
	public void testFixedTwoRegionalFamilyBorrowed() {
		long startMillis = 1491004800000L;
		String[] resCSV = new String[]{
			// account, product, region, reservationID, reservationOfferingId, instanceType, scope, availabilityZone, multiAZ, start, end, duration, usagePrice, fixedPrice, instanceCount, productDescription, state, currencyCode, offeringType, recurringCharge
				"111111111111,EC2,us-east-1,1aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.small,Region,,false,1464699998099,1496235997000,31536000,0.0,206.0,4,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
				"222222222222,EC2,us-east-1,2aaaaaaa-bbbb-cccc-ddddddddddddddddd,,m1.small,Region,,false,1464699998099,1496235997000,31536000,0.0,206.0,4,Linux/UNIX (Amazon VPC),active,USD,All Upfront,",
		};
		
		Datum[] usageData = new Datum[]{
			new Datum(accounts.get(2), Region.US_EAST_1, Zone.US_EAST_1A, Operation.bonusReservedInstancesFixed, "m1.xlarge", 1.0),
		};
				
		Datum[] expectedUsageData = new Datum[]{
			new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.small", 4.0),
			new Datum(accounts.get(1), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.small", 4.0),
			new Datum(accounts.get(2), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.xlarge", 1.0),
		};
		
		Datum[] costData = new Datum[]{				
		};
		Datum[] expectedCostData = new Datum[]{
				new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.small", 0.094),
				new Datum(accounts.get(1), Region.US_EAST_1, null, Operation.upfrontAmortizedFixed, "m1.small", 0.094),
				new Datum(accounts.get(0), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.small", 0.0),
				new Datum(accounts.get(1), Region.US_EAST_1, null, Operation.lentInstancesFixed, "m1.small", 0.0),
				new Datum(accounts.get(2), Region.US_EAST_1, Zone.US_EAST_1A, Operation.borrowedInstancesFixed, "m1.xlarge", 0.0),
		};

		runOneHourTest(startMillis, resCSV, usageData, costData, expectedUsageData, expectedCostData, "m1");		
	}
}